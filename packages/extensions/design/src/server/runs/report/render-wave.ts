export function renderWave(input: {
  wave: string
  summary: Record<string, unknown>[]
  judged: Record<string, unknown>[]
}): string {
  const widths = input.summary.map((row) => [
    `## ${String(row.arm ?? '')} ${String(row.width)}`,
    '',
    ...table([row]),
    '',
  ])
  return [`# ${input.wave}`, '', ...widths.flat(), '## runs', '', ...table(input.judged), ''].join('\n')
}

function table(rows: Record<string, unknown>[]): string[] {
  const [first] = rows
  if (first === undefined) return []
  const header = Object.keys(first)
  return [line(header), line(header.map(() => '-')), ...rows.map((row) => line(Object.values(row).map(cell)))]
}

function line(cells: string[]): string {
  return `| ${cells.join(' | ')} |`
}

function cell(value: unknown): string {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
}
