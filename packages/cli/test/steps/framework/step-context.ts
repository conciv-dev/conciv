import type {InitContext} from '../../../src/init/pipeline.js'

export function stepContext(cwd: string): {reports: string[]; ctx: InitContext} {
  const reports: string[] = []
  const ctx: InitContext = {cwd, yes: true, dryRun: false, report: (line) => reports.push(line)}
  return {reports, ctx}
}
