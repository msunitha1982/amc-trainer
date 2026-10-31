import { PageTitle, Section, linkCls } from '../components/ui.tsx'
import { APP_NAME, REPO_URL } from '../config.ts'

export function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-10 leading-relaxed">
      <PageTitle>About</PageTitle>
      <Section title="Problems">
        <p className="text-ink-2">
          Every problem comes from the AMC 10 and AMC 12, written by the{' '}
          <a className={linkCls} href="https://maa.org/student-programs/amc/" target="_blank" rel="noreferrer">Mathematical Association of America</a>.
          Statements, diagrams and answer keys are from the{' '}
          <a className={linkCls} href="https://artofproblemsolving.com/wiki/" target="_blank" rel="noreferrer">AoPS Wiki</a>, available under{' '}
          <a className={linkCls} href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA</a>,
          read through the Internet Archive's copies of its pages. Each problem's “Source” link opens its wiki page. Topic tags and
          difficulty are this site's own and share the same license.
        </p>
        <p className="mt-3 text-ink-2">{APP_NAME} is an independent, non-commercial project, not affiliated with the MAA or Art of Problem Solving.</p>
      </Section>
      <Section title="Ratings">
        <p className="text-ink-2">
          You and every problem have a Glicko rating. Solving a problem counts as beating it; missing it counts as losing. A problem's
          starting rating comes from its position on the test (AMC 10 #1 is 700 and #25 is 2020; AMC 12 #1 is 800 and #25 is 2240),
          and it moves as people answer it. Only your first answer to a problem is rated, and a wrong first answer costs rating.
        </p>
        <p className="mt-3 text-ink-2">Difficulty: Warm-up below 1100, Medium 1100–1499, Hard 1500–1899, Boss 1900 and up. Days roll over at midnight US Eastern.</p>
      </Section>
      <Section title="Source code">
        <p className="text-ink-2"><a className={linkCls} href={REPO_URL} target="_blank" rel="noreferrer">{REPO_URL.replace('https://', '')}</a></p>
      </Section>
    </div>
  )
}
