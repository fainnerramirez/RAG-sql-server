/app
  /api
    /documents/route.ts     → POST: subir + procesar documento
    /chat/route.ts          → POST: pregunta → retrieval → respuesta (streaming)
  /page.tsx                 → UI principal (chat)
  /components
    ChatWindow.tsx
    UploadPanel.tsx
    SourcesPanel.tsx         → muestra qué chunks se usaron
/lib
  db.ts                     → conexión mssql (pool singleton)
  embeddings.ts             → wrapper OpenAI embeddings
  chunking.ts               → función de split de texto
  retrieval.ts              → query VECTOR_DISTANCE