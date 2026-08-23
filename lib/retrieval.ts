// lib/retrieval.ts
import sql from "mssql";
import { getPool } from "@/lib/db";
import { generateEmbedding, embeddingToSqlJson } from "@/lib/embeddings";

export interface RetrievedChunk {
  chunkId: number;
  documentId: number;
  fileName: string;
  content: string;
  distance: number;
}

interface RetrievalOptions {
  topK?: number;
  maxDistance?: number; // filtro opcional: descarta chunks muy poco relevantes
}

export async function retrieveRelevantChunks(
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievedChunk[]> {
  const { topK = 5, maxDistance } = options;

  // 1. Embedding de la pregunta
  const queryEmbedding = await generateEmbedding(query);
  const embeddingJson = embeddingToSqlJson(queryEmbedding);

  // 2. Query con VECTOR_DISTANCE (cosine)
  const pool = await getPool();
  const request = pool.request();
  request.input("embeddingJson", sql.NVarChar(sql.MAX), embeddingJson);
  request.input("topK", sql.Int, topK);

  const result = await request.query<{
    Id: number;
    DocumentId: number;
    FileName: string;
    Content: string;
    Distance: number;
  }>(`
    SELECT TOP (@topK)
      c.Id AS Id,
      c.DocumentId AS DocumentId,
      d.FileName AS FileName,
      c.Content AS Content,
      VECTOR_DISTANCE('cosine', c.Embedding, CAST(@embeddingJson AS VECTOR(1536))) AS Distance
    FROM Chunks c
    INNER JOIN Documents d ON d.Id = c.DocumentId
    ORDER BY Distance ASC;
  `);

  let chunks: RetrievedChunk[] = result.recordset.map((row) => ({
    chunkId: row.Id,
    documentId: row.DocumentId,
    fileName: row.FileName,
    content: row.Content,
    distance: row.Distance,
  }));

  // 3. Filtro opcional: descartar resultados poco relevantes
  if (maxDistance !== undefined) {
    chunks = chunks.filter((c) => c.distance <= maxDistance);
  }

  return chunks;
}

/**
 * Arma el bloque de contexto para inyectar en el prompt del LLM,
 * a partir de los chunks recuperados.
 */
export function buildContextBlock(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[Fuente ${i + 1} - ${c.fileName}]\n${c.content}`
    )
    .join("\n\n---\n\n");
}