import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {formatReport, runCheck} from './check-references.ts'

const currentDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(currentDir, '..', '..', '..')

const outcome = runCheck(repoRoot)
const report = formatReport(outcome)
if (outcome.findings.length === 0) {
  console.log(report)
} else {
  console.error(report)
  process.exit(1)
}
