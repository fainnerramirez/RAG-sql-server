// components/ChatWindow.tsx
"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Source {
  chunkId: number;
  fileName: string;
  distance: number;
}

interface ChatWindowProps {
  onSourcesUpdate: (sources: Source[]) => void;
}

export default function ChatWindow({ onSourcesUpdate }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const userMessage = input.trim();
    if (!userMessage || isStreaming) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          sessionId: sessionIdRef.current,
        }),
      });

      if (!response.body) throw new Error("Sin respuesta del servidor");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.type === "sources") {
            onSourcesUpdate(event.sources);
          } else if (event.type === "delta") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...last,
                content: last.content + event.content,
              };
              return updated;
            });
          }
        }
      }
    } catch (error) {
      console.error("Error en el chat:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Ocurrió un error al procesar tu mensaje." },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-gray-400 text-sm text-center mt-8">
            Sube un documento y hazme una pregunta sobre su contenido.
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-lg px-4 py-2 whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-900"
              }`}
            >
              {msg.content || (isStreaming && i === messages.length - 1 ? "..." : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe tu pregunta..."
          rows={1}
          className="flex-1 resize-none border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={sendMessage}
          // disabled={isStreaming || !input.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}