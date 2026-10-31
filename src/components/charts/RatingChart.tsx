import { useMemo, useRef, useState } from 'react'

/** Rating over time: one 2px line, recessive grid, crosshair + tooltip on hover. */
export function RatingChart({ points }: { points: [number, number][] }) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = 220
  const pad = { l: 40, r: 12, t: 12, b: 24 }

  const data = useMemo(() => points.map(([t, r]) => ({ t: t * 1000, r })), [points])
  const { x, y, ticks, minT, maxT } = useMemo(() => {
    const rs = data.map((d) => d.r)
    const lo = Math.floor((Math.min(...rs, 1200) - 50) / 100) * 100
    const hi = Math.ceil((Math.max(...rs, 1200) + 50) / 100) * 100
    const minT = data[0]?.t ?? 0
    const maxT = Math.max(data[data.length - 1]?.t ?? 1, minT + 1)
    const step = hi - lo > 800 ? 200 : 100
    const ticks: number[] = []
    for (let v = lo; v <= hi; v += step) ticks.push(v)
    return {
      // Plot by attempt index so bursts of practice don't bunch up.
      x: (i: number) => pad.l + (data.length <= 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r)),
      y: (r: number) => pad.t + (1 - (r - lo) / (hi - lo)) * (H - pad.t - pad.b),
      ticks, minT, maxT,
    }
  }, [data, pad.l, pad.r, pad.t, pad.b])

  if (data.length === 0) return <p className="text-sm text-ink-3">No rated answers yet.</p>

  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.r).toFixed(1)}`).join('')
  const onMove = (e: React.PointerEvent) => {
    const box = ref.current!.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    const i = data.length <= 1 ? 0 : Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }
  const h = hover !== null ? data[hover] : null
  const fmt = (t: number) => new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric' })

  return (
    <div className="viz-line relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-label={`Rating history: ${data.length} rated answers, from ${Math.round(data[0].r)} to ${Math.round(data[data.length - 1].r)}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="fill-[var(--ink-2)] text-[10px] tabular-nums">{v}</text>
          </g>
        ))}
        <text x={pad.l} y={H - 6} className="fill-[var(--ink-2)] text-[10px]">{fmt(minT)}</text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-[var(--ink-2)] text-[10px]">{fmt(maxT)}</text>
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Mark the latest rating so a single answer is still visible. */}
        <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].r)} r={4} fill="var(--series-1)" />
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(h.r)} r={4.5} fill="var(--series-1)" stroke="var(--bg)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-[3px] border border-line-2 bg-raised px-2 py-1 text-xs text-ink"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W * 0.7 ? 'translateX(-105%)' : 'translateX(8px)' }}
        >
          <strong className="tabular-nums">{Math.round(h.r)}</strong> · {fmt(h.t)} · answer #{hover + 1}
        </div>
      )}
    </div>
  )
}
