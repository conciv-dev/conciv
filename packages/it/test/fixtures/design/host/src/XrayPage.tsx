import {SegmentGroup} from '@conciv/ui-kit-system'
import {Far} from './Far'
import {Stat, StatCard} from './Stat'

export function XrayPage() {
  return (
    <main>
      <SegmentGroup.Root value="layers">
        <SegmentGroup.Item value="layers">Layers</SegmentGroup.Item>
      </SegmentGroup.Root>
      <Stat label="Nodes" />
      <StatCard label="Rows" tone="up" />
      <Far title="far" />
    </main>
  )
}
