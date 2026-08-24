# RAG con SQL Server como base de datos vectorial

Aplicación web de Retrieval-Augmented Generation (RAG) que permite cargar documentos, convertir su contenido en embeddings y almacenarlos como vectores en SQL Server. Después, las preguntas del usuario se convierten en embeddings, se buscan los fragmentos más cercanos mediante `VECTOR_DISTANCE` y se envían como contexto a un modelo de lenguaje.

La interfaz permite:

- Cargar archivos PDF, TXT y Markdown.
- Consultar el estado de los documentos procesados.
- Hacer preguntas sobre el contenido cargado.
- Recibir la respuesta del asistente en streaming.
- Ver las fuentes y la distancia vectorial de los fragmentos utilizados.

## Arquitectura

```text
                  +----------------------+
                  |      Next.js UI      |
                  | carga + chat + fuentes|
                  +----------+-----------+
                             |
                +------------+-------------+
                |                          |
         POST /api/documents        POST /api/chat
                |                          |
       extraer texto del archivo     embedding de pregunta
                |                          |
        dividir en chunks            VECTOR_DISTANCE
                |                          |
          OpenAI Embeddings      SQL Server: Chunks
                |                          |
       SQL Server: Documents       contexto recuperado
                |                          |
                +------------+-------------+
                             |
                      OpenAI Chat Completions
                         respuesta streaming
```

## Flujo de carga de documentos

El endpoint `POST /api/documents` registra el documento, extrae su texto, lo divide en fragmentos de 500 tokens con solapamiento de 75, genera embeddings con `text-embedding-3-small`, guarda los fragmentos como `VECTOR(1536)` en SQL Server y marca el documento como `ready`. Si ocurre un error, intenta marcarlo como `error`.

Se aceptan PDF, TXT y Markdown. Los PDFs se procesan en Node.js mediante `pdf-parse`, con el worker de PDF.js configurado explícitamente para Next.js.

## Flujo de preguntas

El endpoint `POST /api/chat` genera el embedding de la pregunta y recupera los cinco fragmentos más cercanos usando distancia coseno con `VECTOR_DISTANCE`. Construye el contexto con el nombre de cada archivo, guarda la pregunta en `ChatHistory` y consulta `gpt-4o-mini`.

La respuesta se envía como `application/x-ndjson` en streaming: primero un evento `sources` con las fuentes recuperadas y después eventos `delta` con partes de la respuesta. Al finalizar, se guarda la respuesta completa y los IDs de los chunks usados. El prompt obliga al modelo a responder únicamente con el contexto recuperado y a reconocer cuando no hay información suficiente.

## Tecnologías

- Next.js `16.3.2` con App Router, React `19.2.8` y TypeScript.
- SQL Server 2025 con soporte para el tipo `VECTOR`.
- `mssql` para la conexión y un pool singleton reutilizado durante hot reload.
- OpenAI `text-embedding-3-small` (1536 dimensiones).
- OpenAI `gpt-4o-mini` para generar respuestas.
- `pdf-parse` para extraer texto de PDF.
- `js-tiktoken` con `cl100k_base` para dividir y contar tokens.
- Tailwind CSS.

## Requisitos

- Node.js compatible con Next.js y `pdf-parse`.
- SQL Server 2025 instalado y ejecutándose.
- TCP/IP habilitado y un puerto TCP accesible, normalmente `1433`.
- Una cuenta SQL Server con permisos sobre la base de datos.
- Una clave válida de OpenAI.

## Configuración de SQL Server

En **SQL Server Configuration Manager**, abre `SQL Server Network Configuration` → `Protocols for MSSQLSERVER`, habilita `TCP/IP` y, en la pestaña `IP Addresses`, configura en `IPAll`:

```text
TCP Dynamic Ports: [vacío]
TCP Port: 1433
```

Reinicia `SQL Server (MSSQLSERVER)` y comprueba el puerto:

```powershell
Test-NetConnection 127.0.0.1 -Port 1433
```

El resultado esperado es `TcpTestSucceeded : True`. El puerto `1434` pertenece normalmente a SQL Server Browser, no al motor de SQL Server.

## Crear la base de datos

En SSMS ejecuta:

```sql
CREATE DATABASE RagLearningDB;
GO
```

Después selecciona `RagLearningDB` y ejecuta todo [`schema.sql`](schema.sql). El script crea:

- `Documents`: documentos cargados y estado (`processing`, `ready` o `error`).
- `Chunks`: texto, tokens y embeddings `VECTOR(1536)`.
- `ChatHistory`: preguntas, respuestas y fuentes utilizadas.
- Índice por `DocumentId`.

La dimensión `1536` debe coincidir con `text-embedding-3-small`.

## Variables de entorno

Crea `.env.local` en la raíz:

```env
DB_SERVER=127.0.0.1
DB_DATABASE=RagLearningDB
DB_USER=sa
DB_PASSWORD=tu_password_de_sql_server
DB_PORT=1433
OPENAI_API_KEY=tu_clave_de_openai
```

## Instalación y ejecución

```powershell
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Para producción:

```powershell
npm run build
npm run start
```

En PowerShell de Windows, si la política de ejecución bloquea `npm`, usa `npm.cmd`.

## Endpoints

### `GET /api/documents`

Devuelve los documentos ordenados por fecha descendente, incluyendo `Id`, `FileName`, `FileType`, `Status` y `UploadedAt`.

### `POST /api/documents`

Recibe `multipart/form-data` con el campo `file`. Ejemplo de respuesta:

```json
{
  "documentId": 1,
  "fileName": "manual.pdf",
  "chunksCreated": 12,
  "status": "ready"
}
```

### `POST /api/chat`

Recibe:

```json
{
  "message": "¿Qué explica el documento?",
  "sessionId": "opcional"
}
```

Devuelve `application/x-ndjson` y el encabezado `X-Session-Id`. Cada línea es un evento `sources` o `delta`.

## Estructura del proyecto

```text
app/
  api/chat/route.ts          Preguntas, retrieval y respuesta streaming
  api/documents/route.ts     Carga y procesamiento de documentos
  page.tsx                   Interfaz principal
components/
  ChatWindow.tsx             Chat y lectura del streaming
  SourcesPanel.tsx           Fuentes recuperadas
  UplodaPanel.tsx            Carga y estado de documentos
lib/
  chunking.ts                División del texto en tokens
  db.ts                      Pool singleton de SQL Server
  embeddings.ts              Embeddings de documentos y preguntas
  retrieval.ts               Búsqueda vectorial y contexto
schema.sql                   Esquema de SQL Server
```

## Diagnóstico rápido

- `Failed to connect to localhost:1433`: revisa TCP/IP, el servicio SQL Server y `Test-NetConnection`.
- `Invalid object name 'Documents'`: confirma `DB_DATABASE=RagLearningDB` y ejecuta [`schema.sql`](schema.sql) en esa base.
- `Setting up fake worker failed`: conserva la configuración del worker en `app/api/documents/route.ts`; si es necesario, borra `.next` y reinicia:

  ```powershell
  Remove-Item -Recurse -Force .next
  npm run dev
  ```

- Sin resultados relevantes: confirma que el documento esté `ready`, que existan filas en `Chunks` y que los vectores tengan dimensión `1536`.