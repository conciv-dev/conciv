import {execFile} from 'node:child_process'
import {readFile, rm, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'

const runFile = promisify(execFile)
const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const oxlintBin = join(packageDir, 'node_modules', '.bin', 'oxlint')

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stdoutOf(value: unknown): string {
  if (isRecord(value) && typeof value.stdout === 'string') return value.stdout
  throw new Error(`oxlint produced no stdout: ${String(value)}`)
}

export async function lintDiagnostics(configFile: string, target: string): Promise<Record<string, unknown>[]> {
  const result = await runFile(oxlintBin, ['-c', configFile, '-f', 'json', target], {cwd: packageDir}).catch(
    (error: unknown) => ({stdout: stdoutOf(error)}),
  )
  const parsed: unknown = JSON.parse(result.stdout)
  if (!isRecord(parsed) || !Array.isArray(parsed.diagnostics)) {
    throw new Error(`unexpected oxlint payload: ${result.stdout}`)
  }
  return parsed.diagnostics.filter(isRecord)
}

export async function lintFix(configFile: string, fixture: string): Promise<string> {
  const source = await readFile(join(packageDir, fixture), 'utf8')
  const scratchPath = `${fixture}.scratch.tsx`
  const scratchAbsolute = join(packageDir, scratchPath)
  await writeFile(scratchAbsolute, source)
  await runFile(oxlintBin, ['-c', configFile, '--fix', scratchPath], {cwd: packageDir}).catch(() => undefined)
  const fixed = await readFile(scratchAbsolute, 'utf8')
  await rm(scratchAbsolute)
  return fixed
}
