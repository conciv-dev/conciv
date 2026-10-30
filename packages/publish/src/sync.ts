import {execa} from 'execa'
import type {RegistryRecord, RegistryState} from './registry.ts'
import {readWorkspacePackages} from './workspace.ts'

export type SyncPackageState = RegistryRecord & {name: string}
export type SyncAction = 'publish' | 'trust' | 'tag'
export type SyncPlanEntry = {name: string; state: RegistryState; actions: SyncAction[]}

async function tagExists(cwd: string, tag: string): Promise<boolean> {
  const {stdout} = await execa('git', ['tag', '-l', tag], {cwd})
  return stdout.trim().length > 0
}

async function needsTag(cwd: string, {name, state, versions}: SyncPackageState, version: string | undefined) {
  if (version === undefined) return false
  if (state !== 'missing' && !versions.includes(version)) return false
  return !(await tagExists(cwd, `${name}@${version}`))
}

export async function buildSyncPlan(cwd: string, states: readonly SyncPackageState[]): Promise<SyncPlanEntry[]> {
  const packages = await readWorkspacePackages(cwd)
  const entries = await Promise.all(
    states.map(async (packageState): Promise<SyncPlanEntry> => {
      const {name, state} = packageState
      const version = packages.find((pkg) => pkg.manifest.name === name)?.manifest.version
      const wanted: [SyncAction, boolean][] = [
        ['publish', state === 'missing'],
        ['trust', state !== 'trusted'],
        ['tag', await needsTag(cwd, packageState, version)],
      ]
      return {name, state, actions: wanted.filter(([, on]) => on).map(([action]) => action)}
    }),
  )
  return entries.filter(({actions}) => actions.length > 0)
}

export async function pushMissingTags(cwd: string, names: readonly string[]): Promise<void> {
  if (names.length === 0) return
  const packages = await readWorkspacePackages(cwd)
  const tags = names.map((name) => {
    const version = packages.find((pkg) => pkg.manifest.name === name)?.manifest.version
    if (version === undefined) {
      throw new Error(`${name}: no versioned manifest in the workspace to tag`)
    }
    return `${name}@${version}`
  })
  for (const tag of tags) {
    if (!(await tagExists(cwd, tag))) {
      await execa('git', ['tag', tag], {cwd})
    }
  }
  await execa('git', ['push', 'origin', ...tags.map((tag) => `refs/tags/${tag}`)], {cwd, stdio: 'inherit'})
}
