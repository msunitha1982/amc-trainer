import { useMemo, useState } from 'react'
import { addDays, appDay } from '../../lib/time.ts'

/**
 * GitHub-style activity calendar: one column per week, one cell per day, single-hue sequential
 * color (light→dark = few→many attempts). Colors come from CSS variables so dark mode gets its
 * own steps rather than an automatic inversion.
 */
export function Heatmap({ days }: { days: Record<string, number> }) {
  const [hover, setHover] = useState<{ day: string; n: number; x: number; y: number } | null>(null)
  const today = appDay()
  const { weeks, months, max } = useMemo(() => {
    // Start on the Sunday 52 weeks before this week.
    const dow = new Date(today + 'T12:00:00Z').getUTCDay()
    const start = addDays(today, -dow - 52 * 7)
    const weeks: { day: string; n: number }[][] = []
    const months: { label: string; col: number }[] = []
    let max = 0
    for (let w = 0; w < 53; w++) {
      const col: { day: string; n: number }[] = []
      for (let d = 0; d < 7; d++) {
        const day = addDays(start, w * 7 + d)
        if (day > today) break
        const n = days[day] ?? 0
        max = Math.max(max, n)
        col.push({ day, n })
        if (day.endsWith('-01') || (w === 0 && d === 0)) {
          months.push({ label: new Date(day + 'T12:00:00Z').toLocaleString('en', { month: 'short', timeZone: 'UTC' }), col: w })
        }
      }
      weeks.push(col)
    }
    return { weeks, months, max }
  }, [days, today])

  const level = (n: number) => (n === 0 ? 0 : max <= 4 ? Math.min(4, n) : Math.min(4, Math.ceil((4 * n) / max)))
  const CELL = 11
  const GAP = 2
  const width = 53 * (CELL + GAP) + 24
  const total = Object.values(days).reduce((a, b) => a + b, 0)

  return (
    <div className="viz-heat relative">
      <div className="overflow-x-auto">
        <svg width={width} height={7 * (CELL + GAP) + 18} role="img" aria-label={`Activity calendar: ${total} answers in the last year`}>
          {months.map((m, i) =>
            i > 0 && m.col - months[i - 1].col < 3 ? null : (
              <text key={m.label + m.col} x={24 + m.col * (CELL + GAP)} y={9} className="fill-[var(--text-muted)] text-[9px]">
                {m.label}
              </text>
            ),
          )}
          {['Mon', 'Wed', 'Fri'].map((d, i) => (
            <text key={d} x={0} y={14 + (1 + i * 2) * (CELL + GAP) + 8} className="fill-[var(--text-muted)] text-[9px]">
              {d}
            </text>
          ))}
          {weeks.map((col, w) =>
            col.map(({ day, n }, d) => (
              <rect
                key={day}
                x={24 + w * (CELL + GAP)}
                y={14 + d * (CELL + GAP)}
                width={CELL}
                height={CELL}
                rx={2}
                fill={`var(--heat-${level(n)})`}
                onMouseEnter={(e) => setHover({ day, n, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${n} answer${n === 1 ? '' : 's'} on ${day}`}</title>
              </rect>
            )),
          )}
        </svg>
      </div>
      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow dark:bg-slate-100 dark:text-slate-900"
          style={{ left: hover.x + 10, top: hover.y - 32 }}
        >
          <strong>{hover.n}</strong> answer{hover.n === 1 ? '' : 's'} · {new Date(hover.day + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
        </div>
      )}
      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[var(--text-muted)]">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="inline-block h-[11px] w-[11px] rounded-sm" style={{ background: `var(--heat-${l})` }} />
        ))}
        More
      </div>
    </div>
  )
}
