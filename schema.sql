-- =========================================
-- 1. Habilitar preview features (necesario para VECTOR_SEARCH más adelante)
-- No es obligatorio para VECTOR_DISTANCE, pero lo dejamos listo
-- =========================================
ALTER DATABASE SCOPED CONFIGURATION SET PREVIEW_FEATURES = ON;
GO

-- =========================================
-- 2. Tabla de documentos originales
-- =========================================
CREATE TABLE Documents (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    FileName NVARCHAR(255) NOT NULL,
    FileType NVARCHAR(20) NOT NULL,        -- 'pdf', 'txt', 'md'
    UploadedAt DATETIME2 DEFAULT SYSDATETIME(),
    Status NVARCHAR(20) DEFAULT 'processing' -- 'processing' | 'ready' | 'error'
);
GO

-- =========================================
-- 3. Tabla de chunks + embeddings
-- =========================================
CREATE TABLE Chunks (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    DocumentId INT NOT NULL,
    ChunkIndex INT NOT NULL,               -- posición del chunk dentro del doc
    Content NVARCHAR(MAX) NOT NULL,
    TokenCount INT NULL,
    Embedding VECTOR(1536) NOT NULL,       -- text-embedding-3-small = 1536 dims
    CreatedAt DATETIME2 DEFAULT SYSDATETIME(),
    CONSTRAINT FK_Chunks_Documents FOREIGN KEY (DocumentId)
        REFERENCES Documents(Id) ON DELETE CASCADE
);
GO 

-- =========================================
-- 4. Historial de chat (para trazabilidad / debugging del RAG)
-- =========================================
CREATE TABLE ChatHistory (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    SessionId UNIQUEIDENTIFIER NOT NULL,
    Role NVARCHAR(10) NOT NULL,            -- 'user' | 'assistant'
    Content NVARCHAR(MAX) NOT NULL,
    SourceChunkIds NVARCHAR(MAX) NULL,     -- JSON array: [12, 45, 3]
    CreatedAt DATETIME2 DEFAULT SYSDATETIME()
);
GO

-- =========================================
-- 5. Índice normal (no vectorial) para queries por documento
-- =========================================
CREATE INDEX IX_Chunks_DocumentId ON Chunks(DocumentId);
GO