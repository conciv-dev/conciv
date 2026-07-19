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
  const turbo = (...tasks: string[]) => run('pnpm', ['exec', 'turbo', 'run', ...tasks])
  const changeset = (...args: string[]) => run('pnpm', ['exec', 'changeset', ...args])
  return {cwd, run, turbo, changeset}
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

async function firstPublish(run: Run, name: string): Promise<void> {
  await run('pnpm', ['--filter', name, 'publish', '--access', 'public', '--no-git-checks']).catch((error: unknown) => {
    console.log(
      `${name}: publish failed. If npm reported "previously published versions", the registry 404 cache is stale and the package is fine - rerun sync in a few minutes. If it reported EOTP or E403, run "npm login" (browser + 2FA) and rerun sync from a real terminal.`,
    )
    throw error
  })
}

async function wireTrust(run: Run, name: string): Promise<void> {
  await run(
    'npx',
    npmTrust('github', name, '--repo', REPOSITORY, '--file', RELEASE_WORKFLOW, '--allow-publish', '--yes'),
  ).catch((error: unknown) => {
    console.log(
      `${name}: trust setup failed. npm trust needs a real terminal, an "npm login" browser session, and 2FA on the account (bypass-2FA tokens are rejected). If a config already exists, verify with: npx npm@^11.15.0 trust list ${name}`,
    )
    throw error
  })
}

type Run = Awaited<ReturnType<typeof atRoot>>['run']

const sync = defineCommand({
  meta: {
    name: 'sync',
    description:
      'Reconcile npm with PUBLIC_PACKAGES: first-publish new packages, wire trusted publishing, push missing tags. Idempotent.',
  },
  args: {
    'dry-run': {
      type: 'boolean',
      default: false,
      description: 'Report the plan without publishing or configuring anything',
    },
    json: {type: 'boolean', default: false, description: 'Print the per-package states and plan as JSON'},
  },
  async run({args}) {
    const {cwd, run, turbo} = await atRoot()
    const states = await Promise.all(PUBLIC_PACKAGES.map(async (name) => ({name, state: await registryState(name)})))
    const unhealthy = states.filter(({state}) => state !== 'trusted')
    const plan = unhealthy.map(({name, state}) => ({
      name,
      state,
      actions: state === 'missing' ? ['publish', 'trust', 'tag'] : ['trust'],
    }))
    if (args.json) {
      console.log(JSON.stringify({healthy: states.length - unhealthy.length, plan}, null, 2))
    }
    if (!args.json) {
      for (const {name, state, actions} of plan) {
        console.log(`${name}: ${state} -> ${actions.join(', ')}`)
      }
      console.log(`${states.length - unhealthy.length}/${states.length} packages healthy`)
    }
    if (unhealthy.length === 0 || args['dry-run']) return
    await run('npm', ['whoami'])
    for (const {name, state} of unhealthy) {
      if (state === 'missing') {
        await assertBootstrappable(cwd, name)
        await turbo('build', `--filter=${name}`)
        await firstPublish(run, name)
      }
      await wireTrust(run, name)
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
