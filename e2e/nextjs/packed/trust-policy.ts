import {execFile} from 'node:child_process'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {buildAndPack} from './harness.js'

const execFileAsync = promisify(execFile)

export type TrustPolicyInstallResult = {stdout: string; stderr: string}

const UPSTREAM_BLOCKED_TRUST_EXCLUDES = ['semver', 'langium']

export async function runTrustPolicyInstall(): Promise<TrustPolicyInstallResult> {
  const root = mkdtempSync(join(tmpdir(), 'conciv-trust-policy-'))
  const tgzDir = join(root, 'tgz')
  mkdirSync(tgzDir, {recursive: true})
  try {
    const {overrides} = await buildAndPack(tgzDir)
    const concivIt = overrides['@conciv/it']
    if (concivIt === undefined) throw new Error('buildAndPack did not produce a tarball for @conciv/it')
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({name: 'trust-policy-fixture', version: '0.0.0', private: true}, null, 2),
    )
    const workspaceYaml = [
      'packages:',
      "  - '.'",
      'trustPolicy: no-downgrade',
      'trustPolicyExclude:',
      ...UPSTREAM_BLOCKED_TRUST_EXCLUDES.map((name) => `  - ${name}`),
      'allowBuilds:',
      '  isolated-vm: true',
      'overrides:',
      ...Object.entries(overrides).map(([name, value]) => `  '${name}': '${value}'`),
      '',
    ].join('\n')
    writeFileSync(join(root, 'pnpm-workspace.yaml'), workspaceYaml)
    const {stdout, stderr} = await execFileAsync('pnpm', ['add', '-D', concivIt], {
      cwd: root,
      env: {...process.env, CI: 'true'},
      maxBuffer: 64 * 1024 * 1024,
    })
    return {stdout, stderr}
  } catch (error) {
    const stdout = typeof error === 'object' && error !== null ? String(Reflect.get(error, 'stdout') ?? '') : ''
    const stderr = typeof error === 'object' && error !== null ? String(Reflect.get(error, 'stderr') ?? '') : ''
    throw new Error(`fresh @conciv/it install under trustPolicy: no-downgrade failed\n${stdout}\n${stderr}`, {
      cause: error,
    })
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
}
