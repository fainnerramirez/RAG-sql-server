"use client";

import { useState } from "react";
import ChatWindow from "@/components/ChatWindow";
import UploadPanel from "@/components/UplodaPanel";
import SourcesPanel from "@/components/SourcesPanel";

interface Source {
  chunkId: number;
  fileName: string;
  distance: number;
}

export default function Home() {
  const [sources, setSources] = useState<Source[]>([]);

  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r flex flex-col">
        <UploadPanel />
      </aside>

      <main className="flex-1">
        <ChatWindow onSourcesUpdate={setSources} />
      </main>

      <aside className="w-64 border-l">
        <SourcesPanel sources={sources} />
      </aside>
    </div>
  );
}