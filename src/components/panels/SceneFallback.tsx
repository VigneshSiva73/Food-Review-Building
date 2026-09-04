import { DatasetSummaryCard } from './DatasetSummaryCard'
import { Legend } from './Legend'
import { Card } from '@/components/ui/Card'

/**
 * Shown when 3D is unavailable — no WebGL support, or the scene crashed
 * (plan §§33–34). The dataset stays fully readable without the visualization,
 * which is also the accessibility requirement.
 */
export function SceneFallback({ reason }: { reason: 'unsupported' | 'crashed' }) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-md space-y-3">
        <div className="rounded-lg border border-surface-700 bg-surface-900 p-4">
          <h2 className="text-sm font-semibold">
            {reason === 'unsupported'
              ? '3D view unavailable'
              : 'The 3D view stopped unexpectedly'}
          </h2>
          <p className="mt-1.5 text-xs text-ink-500">
            {reason === 'unsupported'
              ? 'This browser or device does not provide WebGL, so the building cannot be drawn. Every figure it encodes is listed below.'
              : 'The building could not be rendered. The underlying data is unaffected and is listed below; reloading the page usually recovers the view.'}
          </p>
        </div>
        <Card title="Dataset">
          <DatasetSummaryCard />
        </Card>
        <Card title="What the building would show">
          <Legend />
        </Card>
      </div>
    </div>
  )
}
