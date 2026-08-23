// app/api/chat/route.ts
import { NextRequest } from "next/server";
import sql from "mssql";
import OpenAI from "openai";
import { getPool } from "@/lib/db";
import { retrieveRelevantChunks, buildContextBlock } from "@/lib/retrieval";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const CHAT_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `Eres un asistente que responde preguntas ÚNICAMENTE con base en el contexto proporcionado.

Reglas:
- Si la respuesta no está en el contexto, di explícitamente que no tienes esa información en los documentos disponibles. No inventes.
- Cita de qué fuente sale cada afirmación cuando sea posible (ej. "según Fuente 1...").
- Sé conciso y directo.`;

export async function POST(req: NextRequest) {
  const { message, sessionId } = await req.json();

  if (!message || typeof message !== "string") {
    return Response.json({ error: "Falta el campo 'message'" }, { status: 400 });
  }

  const finalSessionId = sessionId || crypto.randomUUID();
  const pool = await getPool();

  // 1. Retrieval
  const chunks = await retrieveRelevantChunks(message, { topK: 5, maxDistance: 0.5 });
  const context = buildContextBlock(chunks);

  // 2. Guardar el mensaje del usuario en el historial
  await pool
    .request()
    .input("sessionId", sql.UniqueIdentifier, finalSessionId)
    .input("role", sql.NVarChar(10), "user")
    .input("content", sql.NVarChar(sql.MAX), message)
    .query(`
      INSERT INTO ChatHistory (SessionId, Role, Content)
      VALUES (@sessionId, @role, @content);
    `);

  // 3. Armar el prompt
  const userPrompt = chunks.length
    ? `Contexto:\n\n${context}\n\nPregunta: ${message}`
    : `No se encontró contexto relevante en los documentos.\n\nPregunta: ${message}`;

  // 4. Llamada al LLM con streaming
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    stream: true,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  // 5. Stream de respuesta al cliente, acumulando texto para guardarlo al final
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Enviamos primero las fuentes usadas, como un evento especial
      const sourcesPayload = JSON.stringify({
        type: "sources",
        sources: chunks.map((c) => ({
          chunkId: c.chunkId,
          fileName: c.fileName,
          distance: c.distance,
        })),
      });
      controller.enqueue(encoder.encode(sourcesPayload + "\n"));

      try {
        for await (const part of completion) {
          const delta = part.choices[0]?.delta?.content ?? "";
          if (delta) {
            fullResponse += delta;
            controller.enqueue(
              encoder.encode(JSON.stringify({ type: "delta", content: delta }) + "\n")
            );
          }
        }
      } finally {
        // Guardar la respuesta completa en el historial
        await pool
          .request()
          .input("sessionId", sql.UniqueIdentifier, finalSessionId)
          .input("role", sql.NVarChar(10), "assistant")
          .input("content", sql.NVarChar(sql.MAX), fullResponse)
          .input("sourceChunkIds", sql.NVarChar(sql.MAX), JSON.stringify(chunks.map((c) => c.chunkId)))
          .query(`
            INSERT INTO ChatHistory (SessionId, Role, Content, SourceChunkIds)
            VALUES (@sessionId, @role, @content, @sourceChunkIds);
          `);

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "X-Session-Id": finalSessionId,
    },
  });
}