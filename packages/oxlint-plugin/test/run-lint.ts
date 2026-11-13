import {execFile} from 'node:child_process'
import {cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {promisify} from 'node:util'
import {afterAll} from 'vitest'

const runFile = promisify(execFile)
const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const oxlintBin = join(packageDir, 'node_modules', '.bin', 'oxlint')
const workspace = createWorkspace()

afterAll(async () => {
  await rm(await workspace, {recursive: true, force: true})
})

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function lintDiagnostics(configFile: string, target: string): Promise<Record<string, unknown>[]> {
  const cwd = await workspace
  const result = await runFile(oxlintBin, ['-c', configFile, '-f', 'json', target], {cwd}).catch((error: unknown) => ({
    stdout: readStdout(error),
  }))
  const parsed: unknown = JSON.parse(result.stdout)
  if (!isRecord(parsed) || !Array.isArray(parsed.diagnostics)) {
    throw new Error(`unexpected oxlint payload: ${result.stdout}`)
  }
  return parsed.diagnostics.filter(isRecord)
}

export async function lintFix(configFile: string, fixture: string): Promise<string> {
  const cwd = await workspace
  const source = await readFile(join(cwd, fixture), 'utf8')
  const scratchPath = `${fixture}.scratch.tsx`
  const scratchAbsolute = join(cwd, scratchPath)
  await writeFile(scratchAbsolute, source)
  await runFile(oxlintBin, ['-c', configFile, '--fix', scratchPath], {cwd}).catch(() => undefined)
  const fixed = await readFile(scratchAbsolute, 'utf8')
  await rm(scratchAbsolute)
  return fixed
}

function readStdout(value: unknown): string {
  if (isRecord(value) && typeof value.stdout === 'string') return value.stdout
  throw new Error(`oxlint produced no stdout: ${String(value)}`)
}

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'oxlint-plugin-'))
  await Promise.all([
    symlink(join(packageDir, 'src'), join(root, 'src')),
    symlink(join(packageDir, 'node_modules'), join(root, 'node_modules')),
    cp(join(packageDir, 'package.json'), join(root, 'package.json')),
    cp(join(packageDir, 'test'), join(root, 'test'), {recursive: true}),
  ])
  const copied = await readdir(join(root, 'test', 'fixtures'), {recursive: true})
  await Promise.all(
    copied
      .filter((path) => path.endsWith('.txt'))
      .map((path) => rename(join(root, 'test', 'fixtures', path), join(root, 'test', 'fixtures', path.slice(0, -4)))),
  )
  await mkdir(join(root, 'fixtures'))
  await rename(
    join(root, 'test', 'fixtures', 'solid-test-render-outside'),
    join(root, 'fixtures', 'solid-test-render-outside'),
  )
  return root
}
