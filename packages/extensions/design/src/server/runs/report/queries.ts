import type {SourceRead} from '@conciv/extension'

export function reportQueries(wave: string): SourceRead[] {
  const where = `wave == ${JSON.stringify(wave)}`
  return [
    {
      from: 'wave_summary',
      where,
      select: ['arm', 'width', 'runs', 'done', 'median_rows', 'median_pixels', 'median_cost', 'median_lowest_rendered'],
      order: [
        {field: 'arm', dir: 'asc'},
        {field: 'width', dir: 'asc'},
      ],
    },
    {
      from: 'judged',
      where,
      select: ['run', 'lane', 'arm', 'target', 'width', 'verdict', 'rows', 'pixels', 'score', 'reason'],
      order: [
        {field: 'run', dir: 'asc'},
        {field: 'target', dir: 'asc'},
        {field: 'width', dir: 'asc'},
      ],
    },
  ]
}
