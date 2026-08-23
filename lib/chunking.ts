import { getEncoding } from "js-tiktoken";

export interface Chunk {
  content: string;
  index: number;
  tokenCount: number;
}

interface ChunkOptions {
  chunkSize?: number;    // tokens por chunk
  overlap?: number;      // tokens de solapamiento entre chunks
}

const encoding = getEncoding("cl100k_base"); // encoding usado por text-embedding-3-* y gpt-4o

export function chunkText(
  text: string,
  options: ChunkOptions = {}
): Chunk[] {
  const { chunkSize = 500, overlap = 75 } = options;

  // Normalizamos espacios/saltos de línea repetidos
  const cleaned = text.replace(/\s+/g, " ").trim();

  const tokens = encoding.encode(cleaned);
  const chunks: Chunk[] = [];

  let start = 0;
  let index = 0;

  while (start < tokens.length) {
    const end = Math.min(start + chunkSize, tokens.length);
    const chunkTokens = tokens.slice(start, end);

    const decoded = encoding.decode(chunkTokens);

    chunks.push({
      content: decoded.trim(),
      index,
      tokenCount: chunkTokens.length,
    });

    index++;

    // Avanzamos el inicio, retrocediendo "overlap" tokens para el solapamiento
    if (end === tokens.length) break;
    start = end - overlap;
  }

  return chunks;
}

// Útil para calcular tokens de un texto suelto (ej. la pregunta del usuario)
export function countTokens(text: string): number {
  return encoding.encode(text).length;
}