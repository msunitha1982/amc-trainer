import { ProblemCard } from '../components/ProblemCard.tsx'
import { Card, Spinner } from '../components/ui.tsx'
import { navigate } from '../lib/router.ts'
import { useStore } from '../lib/store.tsx'

export function ProblemPage({ id }: { id: string }) {
  const { byId, problems } = useStore()
  if (!problems.length) return <Spinner label="Loading problems" />
  const meta = byId.get(id)
  if (!meta) return <Card>Problem “{id}” was not found.</Card>
  return (
    <div className="mx-auto max-w-3xl">
      <ProblemCard key={meta.id} meta={meta} onNext={() => navigate('practice')} nextLabel="Practice more" />
    </div>
  )
}
