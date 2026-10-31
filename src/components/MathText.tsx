import katex from 'katex'
import { memo, type ReactNode } from 'react'
import { assetUrl } from '../lib/data.ts'
import { katexOptions, normalizeLatex } from '../lib/katex.ts'
import type { Segment } from '../lib/types.ts'

function renderLatex(v: string, display: boolean): string | null {
  try {
    return katex.renderToString(normalizeLatex(v), katexOptions(display))
  } catch {
    return null
  }
}

/** One formula. KaTeX output is generated locally from LaTeX with trust disabled. */
export const Formula = memo(function Formula({ v, display = false, img }: { v: string; display?: boolean; img?: string }) {
  const html = renderLatex(v, display)
  if (html === null) {
    if (img) return <img src={img} alt={v} className={display ? 'mx-auto my-2 dark:invert' : 'inline align-middle dark:invert'} loading="lazy" />
    return <code className="text-sm">{v}</code>
  }
  return display ? (
    <div className="my-3 overflow-x-auto overflow-y-hidden" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  )
})

/** Render statement segments as paragraphs of text, inline math, display math and diagrams. */
export const SegmentsView = memo(function SegmentsView({ segments }: { segments: Segment[] }) {
  const blocks: ReactNode[] = []
  let para: ReactNode[] = []
  let key = 0
  const flush = () => {
    if (para.length) blocks.push(<p key={key++} className="my-3">{para}</p>)
    para = []
  }
  for (const s of segments) {
    if (s.t === 'text') {
      const chunks = s.v.split('\n\n')
      chunks.forEach((chunk, i) => {
        if (i > 0) flush()
        const lines = chunk.split('\n')
        lines.forEach((line, j) => {
          if (j > 0) para.push(<br key={key++} />)
          if (line) para.push(<span key={key++}>{line}</span>)
        })
      })
    } else if (s.t === 'math') {
      if (s.display) {
        flush()
        blocks.push(<Formula key={key++} v={s.v} display img={s.img} />)
      } else {
        para.push(<Formula key={key++} v={s.v} img={s.img} />)
      }
    } else {
      flush()
      blocks.push(
        <figure key={key++} className="my-5 flex justify-center">
          <img
            src={assetUrl(s.src)}
            alt={s.alt && s.alt !== 'diagram' ? s.alt : 'Problem diagram'}
            width={s.w}
            height={s.h}
            loading="lazy"
            className="h-auto max-w-full rounded-[2px] bg-white p-2 dark:opacity-90"
          />
        </figure>,
      )
    }
  }
  flush()
  return <div className="problem-text">{blocks}</div>
})
