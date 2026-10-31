/** Topic taxonomy shared by the data pipeline and the app. Tags look like "geometry.circles". */
export const TOPICS = {
  algebra: {
    label: 'Algebra',
    subs: {
      polynomials: 'Polynomials',
      functions: 'Functions',
      inequalities: 'Inequalities',
      sequences: 'Sequences & series',
      logs: 'Logs & exponents',
      systems: 'Systems',
    },
  },
  geometry: {
    label: 'Geometry',
    subs: {
      triangles: 'Triangles',
      circles: 'Circles',
      coordinate: 'Coordinate geometry',
      solid: '3D geometry',
      transformations: 'Transformations',
    },
  },
  number_theory: {
    label: 'Number theory',
    subs: {
      divisibility: 'Divisibility',
      modular: 'Modular arithmetic',
      primes: 'Primes',
      bases: 'Bases',
    },
  },
  counting: {
    label: 'Counting & probability',
    subs: {
      combinatorics: 'Combinatorics',
      expected_value: 'Expected value',
      casework: 'Casework',
      geometric_probability: 'Geometric probability',
    },
  },
} as const

export type MajorTopic = keyof typeof TOPICS
export const MAJOR_TOPICS = Object.keys(TOPICS) as MajorTopic[]

export const ALL_TAGS: string[] = MAJOR_TOPICS.flatMap((m) => Object.keys(TOPICS[m].subs).map((s) => `${m}.${s}`))

export const majorOf = (tag: string) => tag.split('.')[0] as MajorTopic

export function tagLabel(tag: string): string {
  const [m, s] = tag.split('.') as [MajorTopic, string]
  const major = TOPICS[m]
  if (!major) return tag
  return s ? ((major.subs as Record<string, string>)[s] ?? s) : major.label
}
