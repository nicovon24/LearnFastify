/**
 * components/ChatMessage.tsx — Renderizado de mensajes del chat
 *
 * POR QUÉ parsear el mensaje en el frontend:
 *   El backend incluye un bloque especial en la respuesta cuando hay stats:
 *   "PLAYER_STATS_DATA:{...json...}:END_PLAYER_STATS\n\nTexto de la respuesta"
 *
 *   Este componente detecta ese bloque, extrae el JSON, y renderiza el
 *   PlayerCard antes del texto de la respuesta. Eso es Generative UI:
 *   el backend "marca" qué UI mostrar, y el frontend la renderiza.
 *
 *   En una implementación más avanzada, esto se haría con el AI SDK
 *   `useObject()` o con tool results en el stream — pero este patrón
 *   es más simple de entender cuando estás aprendiendo.
 */

"use client";

import { PlayerCard } from "./PlayerCard";
import type { PlayerStats } from "@/lib/types";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  // Intentamos parsear el bloque de stats si es un mensaje del asistente
  const { playerStats, cleanContent } = parseContent(content);

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-sm text-white shadow">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-1">
        {/* Avatar del asistente */}
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
            S
          </div>
          <span className="text-xs text-slate-500">Scout AI</span>
        </div>

        {/* PlayerCard si hay stats (Generative UI) */}
        {playerStats && <PlayerCard stats={playerStats} />}

        {/* Texto de la respuesta */}
        {cleanContent && (
          <div className="rounded-2xl rounded-tl-sm bg-slate-800 px-4 py-3 text-sm leading-relaxed text-slate-200 shadow">
            <MessageText text={cleanContent} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Parsea el contenido del mensaje para extraer el bloque de stats.
 * Devuelve las stats (si hay) y el contenido limpio (sin el bloque JSON).
 */
function parseContent(content: string): {
  playerStats: PlayerStats | null;
  cleanContent: string;
} {
  const statsMatch = content.match(
    /PLAYER_STATS_DATA:([\s\S]*?):END_PLAYER_STATS/
  );

  if (!statsMatch) {
    return { playerStats: null, cleanContent: content };
  }

  try {
    const playerStats = JSON.parse(statsMatch[1]) as PlayerStats;
    // Removemos el bloque del contenido del texto
    const cleanContent = content.replace(statsMatch[0], "").trim();
    return { playerStats, cleanContent };
  } catch {
    return { playerStats: null, cleanContent: content };
  }
}

/**
 * Renderiza el texto con saltos de línea como párrafos.
 * En una app más completa usaríamos react-markdown para renderizar Markdown.
 */
function MessageText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) =>
        line.trim() ? (
          <p key={i} className="mb-1.5 last:mb-0">
            {line}
          </p>
        ) : (
          <div key={i} className="h-1.5" />
        )
      )}
    </>
  );
}
