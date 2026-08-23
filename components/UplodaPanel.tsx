// components/UploadPanel.tsx
"use client";

import { useState, useEffect, useCallback } from "react";

interface Document {
  Id: number;
  FileName: string;
  FileType: string;
  Status: "processing" | "ready" | "error";
  UploadedAt: string;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const body = await response.text();

  if (!body) {
    throw new Error(`El servidor respondió sin datos (HTTP ${response.status})`);
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`El servidor respondió con un formato inválido (HTTP ${response.status})`);
  }
}

export default function UploadPanel() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await readJsonResponse(res);
      if (!res.ok || !Array.isArray(data)) return;
      setDocuments(data as Document[]);
    } catch (err) {
      console.error("Error cargando documentos:", err);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();

    // Polling simple mientras haya documentos en "processing"
    const interval = setInterval(() => {
      setDocuments((current) => {
        if (current.some((d) => d.Status === "processing")) {
          fetchDocuments();
        }
        return current;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchDocuments]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      const data = await readJsonResponse(res) as { error?: string };

      if (!res.ok) throw new Error(data.error ?? "Error al subir el archivo");

      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setIsUploading(false);
      e.target.value = ""; // permite re-subir el mismo archivo si es necesario
    }
  }

  const statusStyles: Record<Document["Status"], string> = {
    processing: "bg-yellow-100 text-yellow-800",
    ready: "bg-green-100 text-green-800",
    error: "bg-red-100 text-red-800",
  };

  return (
    <div className="p-4 border-b">
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Documentos</h2>

      <label className="block">
        <input
          type="file"
          accept=".pdf,.txt,.md"
          onChange={handleFileChange}
          disabled={isUploading}
          className="text-xs"
        />
      </label>

      {isUploading && <p className="text-xs text-gray-500 mt-1">Subiendo y procesando...</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

      <ul className="mt-3 space-y-1 max-h-40 overflow-y-auto">
        {documents.map((doc) => (
          <li key={doc.Id} className="flex items-center justify-between text-xs">
            <span className="truncate max-w-[140px]">{doc.FileName}</span>
            <span className={`px-2 py-0.5 rounded-full ${statusStyles[doc.Status]}`}>
              {doc.Status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}