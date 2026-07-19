#!/usr/bin/env node
import {defineCommand, runMain} from 'citty'
import {execa} from 'execa'
import {findRoot} from './workspace-root.ts'
import {PUBLIC_PACKAGES, assertBootstrappable, assertPublicSet, assertValidTag, assertVersioned} from './guards.ts'
import {registryState} from './registry.ts'

const REPOSITORY = 'conciv-dev/conciv'
const RELEASE_WORKFLOW = 'release.yml'

async function atRoot() {
  const cwd = await findRoot(process.cwd())
  const run = (file: string, args: string[]) => execa(file, args, {cwd, stdio: 'inherit'})
  const capture = (file: string, args: string[]) => execa(file, args, {cwd})
  const turbo = (...tasks: string[]) => run('pnpm', ['exec', 'turbo', 'run', ...tasks])
  const changeset = (...args: string[]) => run('pnpm', ['exec', 'changeset', ...args])
  return {cwd, run, capture, turbo, changeset}
}

const version = defineCommand({
  meta: {name: 'version', description: 'Consume changesets, bump versions, resync the lockfile'},
  async run() {
    const {run, changeset} = await atRoot()
    await changeset('version')
    await run('pnpm', ['install', '--lockfile-only'])
  },
})

const check = defineCommand({
  meta: {name: 'check', description: 'Validate every package: build + publint + attw'},
  async run() {
    const {turbo} = await atRoot()
    await turbo('build', 'publint', 'attw')
  },
})

const release = defineCommand({
  meta: {name: 'release', description: 'Build, validate, then publish to npm via changesets'},
  async run() {
    const {cwd, turbo, changeset} = await atRoot()
    await assertPublicSet(cwd)
    await assertVersioned(cwd)
    await turbo('build', 'publint', 'attw')
    await changeset('publish')
  },
})

const snapshot = defineCommand({
  meta: {name: 'snapshot', description: 'Publish a throwaway prerelease under a dist-tag (never touches latest)'},
  args: {tag: {type: 'positional', default: 'beta', description: 'npm dist-tag, e.g. beta'}},
  async run({args}) {
    assertValidTag(args.tag)
    const {cwd, turbo, changeset} = await atRoot()
    await assertPublicSet(cwd)
    await changeset('version', '--snapshot', args.tag)
    await turbo('build', 'publint', 'attw')
    await changeset('publish', '--tag', args.tag, '--no-git-checks')
  },
})

const npmTrust = (...args: string[]) => ['--yes', 'npm@^11.15.0', 'trust', ...args]

async function hasTrustConfig(capture: Capture, name: string): Promise<boolean> {
  const {stdout} = await capture('npx', npmTrust('list', name, '--json'))
  const configs: unknown = JSON.parse(stdout)
  return Array.isArray(configs) && configs.length > 0
}

type Capture = Awaited<ReturnType<typeof atRoot>>['capture']

const sync = defineCommand({
  meta: {
    name: 'sync',
    description:
      'Reconcile npm with PUBLIC_PACKAGES: first-publish new packages, wire trusted publishing, push missing tags. Idempotent.',
  },
  async run() {
    const {cwd, run, capture, turbo} = await atRoot()
    const states = await Promise.all(PUBLIC_PACKAGES.map(async (name) => ({name, state: await registryState(name)})))
    const unhealthy = states.filter(({state}) => state !== 'trusted')
    if (unhealthy.length === 0) {
      console.log('npm already matches PUBLIC_PACKAGES, nothing to do')
      return
    }
    await run('npm', ['whoami'])
    for (const {name, state} of unhealthy) {
      if (state === 'missing') {
        await assertBootstrappable(cwd, name)
        await turbo('build', `--filter=${name}`)
        await run('pnpm', ['--filter', name, 'publish', '--access', 'public', '--no-git-checks'])
      }
      if (await hasTrustConfig(capture, name)) {
        console.log(`${name}: trusted publisher already configured`)
        continue
      }
      await run(
        'npx',
        npmTrust('github', name, '--repo', REPOSITORY, '--file', RELEASE_WORKFLOW, '--allow-publish', '--yes'),
      )
    }
    await run('pnpm', ['exec', 'changeset', 'tag'])
    await run('git', ['push', 'origin', '--tags'])
  },
})

const main = defineCommand({
  meta: {name: 'conciv-publish', description: 'Release tooling for the aidx monorepo'},
  subCommands: {version, check, release, snapshot, sync},
})

runMain(main)
