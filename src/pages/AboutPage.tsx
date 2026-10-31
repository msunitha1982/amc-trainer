import { Card } from '../components/ui.tsx'
import { APP_NAME, REPO_URL } from '../config.ts'
import { BANDS } from '../lib/rating.ts'

export function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">About {APP_NAME}</h1>
      <Card className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-base font-bold">Where the problems come from</h2>
        <p>
          Every problem is from the <strong>AMC 10</strong> and <strong>AMC 12</strong> competitions, created by the{' '}
          <a className="underline" href="https://maa.org/student-programs/amc/" target="_blank" rel="noreferrer">Mathematical Association of America (MAA)</a>.
          Problem text, diagrams and answer keys are taken from the{' '}
          <a className="underline" href="https://artofproblemsolving.com/wiki/" target="_blank" rel="noreferrer">AoPS Wiki</a>, whose content is available under{' '}
          <a className="underline" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA</a>.
          Each problem links to its wiki page, where you'll find the original statement and community solutions.
        </p>
        <p>
          Because the AoPS Wiki blocks automated access, the data pipeline reads the Internet Archive's Wayback Machine copies of those pages.
          Topic tags and difficulty bands are this site's own additions and are shared under the same license.
        </p>
        <p className="font-semibold">{APP_NAME} is an independent, non-commercial project. It is not affiliated with, endorsed by, or sponsored by the MAA or Art of Problem Solving.</p>
      </Card>
      <Card className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-base font-bold">How ratings work</h2>
        <p>
          You and every problem have a Glicko rating. Answering is a match: solve a problem and you “beat” it, miss it and it beats you.
          Upsets move ratings more, and your first answers move it most while the system learns your level. Problems start from a rating
          based on their test and number, then adapt to how real players do.
        </p>
        <p>
          Only your <strong>first</strong> answer to each problem is rated, and wrong answers cost rating, so guessing doesn't pay. After
          that you can keep practicing it unrated. Answers are checked on the server and never sent to your browser.
        </p>
        <ul className="list-disc pl-5">
          {BANDS.map((b) => (
            <li key={b.id}>
              <strong>{b.label}</strong>: {Number.isFinite(b.min) ? `${b.min}` : 'below'}{Number.isFinite(b.max) ? `–${b.max - 1}` : '+'}
              {!Number.isFinite(b.min) ? ` ${b.max}` : ''}
            </li>
          ))}
        </ul>
        <p>Streaks and the daily problem roll over at midnight US Eastern time.</p>
      </Card>
      <Card className="text-sm">
        Open source: <a className="underline" href={REPO_URL} target="_blank" rel="noreferrer">{REPO_URL.replace('https://', '')}</a>. Found a wrong tag or answer? Use “Report” on the problem.
      </Card>
    </div>
  )
}
