/**
 * components/PlayerCard.tsx — Generative UI
 *
 * POR QUÉ existe este componente:
 *   Esto es el corazón de la "Generative UI" del proyecto.
 *   En vez de que el modelo devuelva los stats de un jugador como texto plano
 *   ("Goles: 8, Asistencias: 12..."), la respuesta incluye los datos estructurados
 *   y el frontend los renderiza como una tarjeta visual.
 *
 *   Eso es Generative UI: el modelo "decide" cuándo mostrar una UI especial
 *   (en este caso, cuando tiene stats de un jugador), y el frontend lo renderiza.
 *   El resultado es una experiencia mucho más rica que un chat de texto plano.
 */

import type { PlayerStats } from "@/lib/types";

interface PlayerCardProps {
  stats: PlayerStats;
}

export function PlayerCard({ stats }: PlayerCardProps) {
  // Rating → color del badge
  const ratingColor =
    stats.rating >= 8
      ? "bg-emerald-500"
      : stats.rating >= 7
      ? "bg-blue-500"
      : stats.rating >= 6
      ? "bg-yellow-500"
      : "bg-red-500";

  // Goles por partido
  const goalsPerMatch =
    stats.matches > 0 ? (stats.goals / stats.matches).toFixed(2) : "0.00";

  // Asistencias por partido
  const assistsPerMatch =
    stats.matches > 0 ? (stats.assists / stats.matches).toFixed(2) : "0.00";

  return (
    <div className="my-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4 shadow-lg backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-white">{stats.name}</h3>
          <p className="text-sm text-slate-400">
            {stats.position} · {stats.team}
          </p>
          <p className="text-xs text-slate-500">{stats.age} años</p>
        </div>
        <div
          className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full ${ratingColor} shadow-lg`}
        >
          <span className="text-xl font-black text-white">
            {stats.rating.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="my-3 h-px bg-slate-700" />

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatBox label="Partidos" value={stats.matches.toString()} />
        <StatBox label="Goles" value={stats.goals.toString()} sub={`${goalsPerMatch}/partido`} />
        <StatBox label="Asistencias" value={stats.assists.toString()} sub={`${assistsPerMatch}/partido`} />
        <StatBox label="Precisión pase" value={`${stats.passAccuracy}%`} />
      </div>

      {/* Footer */}
      <div className="mt-3 rounded-lg bg-slate-900/50 px-3 py-2">
        <p className="text-xs text-slate-500">
          {stats.minutesPlayed.toLocaleString()} minutos jugados · Temporada 2024
        </p>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-900/60 px-3 py-2 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
