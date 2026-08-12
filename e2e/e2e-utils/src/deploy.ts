import {execFile} from 'node:child_process'
import {existsSync, mkdirSync, rmSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {promisify} from 'node:util'
import {deployDir} from './config.js'
import type {E2EApp} from './ports.js'

const execFileAsync = promisify(execFile)

function findWorkspaceRoot(startDir: string): string {
  let dir = startDir
  for (let depth = 0; depth < 12; depth++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`workspace root (pnpm-workspace.yaml) not found above ${startDir}`)
}

function resolveFresh(): boolean {
  return process.env.CONCIV_DEPLOY_FRESH === '1'
}

export async function deployPackedApp(app: E2EApp, pnpmFilter: string): Promise<string> {
  const target = deployDir(app)
  rmSync(target, {recursive: true, force: true})
  mkdirSync(dirname(target), {recursive: true})
  const resolveFlags = resolveFresh() ? [] : ['--prefer-offline']
  const workspaceRoot = findWorkspaceRoot(process.cwd())
  await execFileAsync('pnpm', ['--filter', pnpmFilter, 'deploy', '--legacy', '--prod=false', ...resolveFlags, target], {
    cwd: workspaceRoot,
    maxBuffer: 64 * 1024 * 1024,
  })
  return target
}
