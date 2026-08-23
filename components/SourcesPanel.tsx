"use client";

interface Source {
  chunkId: number;
  fileName: string;
  distance: number;
}

interface SourcesPanelProps {
  sources: Source[];
}

export default function SourcesPanel({ sources }: SourcesPanelProps) {
  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Fuentes usadas</h2>

      {sources.length === 0 ? (
        <p className="text-xs text-gray-400">
          Aquí verás qué fragmentos de tus documentos se usaron en la última respuesta.
        </p>
      ) : (
        <ul className="space-y-2">
          {sources.map((source) => (
            <li key={source.chunkId} className="text-xs border rounded-lg p-2">
              <p className="font-medium truncate">{source.fileName}</p>
              <p className="text-gray-400">
                distancia: {source.distance.toFixed(4)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}