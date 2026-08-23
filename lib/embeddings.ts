// lib/embeddings.ts
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const EMBEDDING_MODEL = "text-embedding-3-small"; // 1536 dimensiones
const MAX_BATCH_SIZE = 100; // límite prudente por request (OpenAI soporta más, pero esto evita payloads gigantes)

export interface EmbeddingResult {
  embedding: number[];
  index: number;
}

/**
 * Genera embeddings para un array de textos, haciendo batching automático.
 * Devuelve los resultados en el mismo orden que los textos de entrada.
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });

    response.data.forEach((item, batchIndex) => {
      results.push({
        embedding: item.embedding,
        index: i + batchIndex, // índice global, no el del batch
      });
    });
  }

  return results;
}

/**
 * Genera el embedding de un solo texto (ej. la pregunta del usuario en /api/chat).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Convierte un array de embedding a JSON string, listo para castear
 * a VECTOR(1536) en SQL Server: CAST(@json AS VECTOR(1536))
 */
export function embeddingToSqlJson(embedding: number[]): string {
  return JSON.stringify(embedding);
}