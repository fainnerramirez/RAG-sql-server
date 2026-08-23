// app/api/documents/route.ts
import { NextRequest } from "next/server";
import sql from "mssql";
import { getPool } from "@/lib/db";
import { chunkText } from "@/lib/chunking";
import { generateEmbeddings, embeddingToSqlJson } from "@/lib/embeddings";

export const runtime = "nodejs"; // pdf-parse necesita Node.js runtime, no Edge

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return parsed.text;
    } finally {
      await parser.destroy();
    }
  }

  if (extension === "txt" || extension === "md") {
    return buffer.toString("utf-8");
  }

  throw new Error(`Tipo de archivo no soportado: .${extension}`);
}

export async function POST(req: NextRequest) {
  const pool = await getPool();
  let documentId: number | undefined;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No se envió ningún archivo" }, { status: 400 });
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "unknown";

    // 1. Registrar el documento como "processing"
    const insertDocResult = await pool
      .request()
      .input("fileName", sql.NVarChar(255), file.name)
      .input("fileType", sql.NVarChar(20), extension)
      .query(`
        INSERT INTO Documents (FileName, FileType, Status)
        OUTPUT INSERTED.Id
        VALUES (@fileName, @fileType, 'processing');
      `);

    documentId = insertDocResult.recordset[0].Id;

    // 2. Extraer texto
    const text = await extractText(file);

    if (!text || text.trim().length === 0) {
      throw new Error("No se pudo extraer texto del archivo (¿está vacío o escaneado como imagen?)");
    }

    // 3. Chunking
    const chunks = chunkText(text, { chunkSize: 500, overlap: 75 });

    if (chunks.length === 0) {
      throw new Error("El chunking no generó fragmentos");
    }

    // 4. Embeddings (batch)
    const embeddingResults = await generateEmbeddings(chunks.map((c) => c.content));

    // 5. Insertar cada chunk (secuencial para no saturar el pool; ver nota abajo)
    for (const chunk of chunks) {
      const embeddingResult = embeddingResults.find((e) => e.index === chunk.index);
      if (!embeddingResult) continue;

      const embeddingJson = embeddingToSqlJson(embeddingResult.embedding);

      await pool
        .request()
        .input("documentId", sql.Int, documentId)
        .input("chunkIndex", sql.Int, chunk.index)
        .input("content", sql.NVarChar(sql.MAX), chunk.content)
        .input("tokenCount", sql.Int, chunk.tokenCount)
        .input("embeddingJson", sql.NVarChar(sql.MAX), embeddingJson)
        .query(`
          INSERT INTO Chunks (DocumentId, ChunkIndex, Content, TokenCount, Embedding)
          VALUES (@documentId, @chunkIndex, @content, @tokenCount, CAST(@embeddingJson AS VECTOR(1536)));
        `);
    }

    // 6. Marcar como listo
    await pool
      .request()
      .input("documentId", sql.Int, documentId)
      .query(`UPDATE Documents SET Status = 'ready' WHERE Id = @documentId;`);

    return Response.json({
      documentId,
      fileName: file.name,
      chunksCreated: chunks.length,
      status: "ready",
    });
  } catch (error) {
    console.error("Error procesando documento:", error);

    // Si ya se había creado el registro del documento, márcalo como error
    if (documentId) {
      await pool
        .request()
        .input("documentId", sql.Int, documentId)
        .query(`UPDATE Documents SET Status = 'error' WHERE Id = @documentId;`);
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

// Endpoint auxiliar para listar documentos (útil para el UploadPanel del frontend)
export async function GET() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT Id, FileName, FileType, Status, UploadedAt
    FROM Documents
    ORDER BY UploadedAt DESC;
  `);
  return Response.json(result.recordset);
}