/**
 * app/page.tsx — Página principal del Scout AI Copilot
 *
 * SOBRE EL MANEJO MANUAL DEL STREAMING:
 *   Versiones recientes del AI SDK (v5+) cambiaron la API de useChat
 *   de forma significativa. Para que el código sea más fácil de entender,
 *   acá manejamos el stream manualmente con fetch + ReadableStream.
 *   Esto es EXACTAMENTE lo que useChat hacía internamente — sin magia.
 *
 *   El flujo es:
 *   1. POST a /api/chat con el historial de mensajes
 *   2. El servidor devuelve un ReadableStream de texto (chunks de tokens)
 *   3. Leemos esos chunks con un TextDecoder y los acumulamos en el estado
 *   4. React re-renderiza con cada chunk → efecto de "streaming en vivo"
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "@/components/ChatMessage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// Preguntas de ejemplo para guiar al usuario
const EXAMPLE_QUESTIONS = [
  "¿Cuántos goles hizo Rodrigo Espinoza esta temporada?",
  "¿Qué dicen los reportes de scouting sobre Marcos Villalba?",
  "Dame un análisis completo de Sebastián Coria",
  "¿Qué lateral derecho me recomendás según los reportes?",
];

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    setError(null);
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // Placeholder del mensaje del asistente que vamos a ir llenando con el stream
    const assistantMessageId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: "assistant", content: "" },
    ]);

    try {
      // ── Llamamos al endpoint con el historial completo ───────────────────────
      // Enviamos TODOS los mensajes para que el servidor tenga contexto de la conversación.
      // El servidor usa el ÚLTIMO mensaje del usuario para invocar el grafo de LangGraph.
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No se recibió stream de respuesta");
      }

      // ── Leer el stream de respuesta token por token ──────────────────────────
      // getReader() nos da un objeto con .read() que devuelve {done, value} chunks.
      // TextDecoder convierte los bytes (Uint8Array) en texto legible.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Cada chunk es un Uint8Array — lo decodificamos a texto
        const chunk = decoder.decode(value, { stream: true });
        accumulatedContent += chunk;

        // Actualizamos el mensaje del asistente con el contenido acumulado hasta ahora.
        // Esto crea el efecto visual de "el texto aparece progresivamente".
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: accumulatedContent }
              : msg
          )
        );
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Error desconocido";
      setError(errorMessage);
      // Removemos el placeholder vacío del asistente si hubo error
      setMessages((prev) =>
        prev.filter((msg) => msg.id !== assistantMessageId)
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-white">
      {/* ── Header ── */}
      <header className="flex-shrink-0 border-b border-slate-800 bg-slate-900/80 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">
              ⚽ Scout AI Copilot
            </h1>
            <p className="text-xs text-slate-500">
              Impulsado por LangGraph + Anthropic Claude + pgvector
            </p>
          </div>
          <div className="flex gap-2">
            <TechBadge label="LangGraph" color="purple" />
            <TechBadge label="RAG" color="blue" />
            <TechBadge label="Streaming" color="emerald" />
          </div>
        </div>
      </header>

      {/* ── Área de mensajes ── */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 ? (
            <EmptyState onExampleClick={sendMessage} />
          ) : (
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
              />
            ))
          )}

          {isLoading && messages.at(-1)?.content === "" && (
            <LoadingIndicator />
          )}

          {error && (
            <div className="rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">
              Error: {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ── Input del chat ── */}
      <footer className="flex-shrink-0 border-t border-slate-800 bg-slate-900/80 px-4 py-4 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl">
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Preguntá sobre un jugador... ej: ¿cómo viene Villalba?"
              disabled={isLoading}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex-shrink-0 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? "..." : "Enviar"}
            </button>
          </form>
          <p className="mt-2 text-center text-xs text-slate-600">
            El grafo de LangGraph decide automáticamente si buscar stats, reportes de scouting, o ambos.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function EmptyState({ onExampleClick }: { onExampleClick: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-8 py-12">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-700 text-4xl shadow-2xl">
        ⚽
      </div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-white">Scout AI Copilot</h2>
        <p className="mt-2 max-w-sm text-sm text-slate-400">
          Un asistente de scouting que combina estadísticas y reportes cualitativos
          para darte análisis completos de jugadores.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-2">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
          Cómo funciona
        </p>
        <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4 text-xs text-slate-400 space-y-2">
          <FlowStep num={1} text="Tu pregunta entra al grafo de LangGraph" />
          <FlowStep num={2} text="El nodo classify decide qué datos necesita" />
          <FlowStep num={3} text="fetchStats y/o fetchReports consultan la DB" />
          <FlowStep num={4} text="synthesize combina todo y arma la respuesta" />
        </div>
      </div>

      <div className="w-full max-w-md space-y-2">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
          Probá con estas preguntas
        </p>
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onExampleClick(q)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-left text-sm text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function FlowStep({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-300">
        {num}
      </div>
      <span>{text}</span>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-slate-800 px-4 py-3">
        <div className="flex gap-1">
          <div className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.3s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-slate-500 [animation-delay:-0.15s]" />
          <div className="h-2 w-2 animate-bounce rounded-full bg-slate-500" />
        </div>
        <span className="text-xs text-slate-500">El agente está procesando...</span>
      </div>
    </div>
  );
}

function TechBadge({
  label,
  color,
}: {
  label: string;
  color: "purple" | "blue" | "emerald";
}) {
  const colors = {
    purple: "border-purple-800 bg-purple-950/50 text-purple-400",
    blue: "border-blue-800 bg-blue-950/50 text-blue-400",
    emerald: "border-emerald-800 bg-emerald-950/50 text-emerald-400",
  };
  return (
    <span
      className={`hidden rounded-full border px-2 py-0.5 text-xs font-medium sm:inline-block ${colors[color]}`}
    >
      {label}
    </span>
  );
}
