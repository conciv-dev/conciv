#!/usr/bin/env node
import {defineCommand, runMain} from 'citty'
import {ExecaError, execa} from 'execa'
import {findRoot} from './workspace-root.ts'
import {PUBLIC_PACKAGES, assertBootstrappable, assertPublicSet, assertValidTag, assertVersioned} from './guards.ts'
import {registryState} from './registry.ts'

const REPOSITORY = 'conciv-dev/conciv'
const RELEASE_WORKFLOW = 'release.yml'

async function atRoot() {
  const cwd = await findRoot(process.cwd())
  const run = (file: string, args: string[]) => execa(file, args, {cwd, stdio: 'inherit'})
  const tee = (file: string, args: string[]) =>
    execa(file, args, {cwd, stdin: 'inherit', stdout: ['inherit', 'pipe'], stderr: ['inherit', 'pipe']})
  const turbo = (...tasks: string[]) => run('pnpm', ['exec', 'turbo', 'run', ...tasks])
  const changeset = (...args: string[]) => run('pnpm', ['exec', 'changeset', ...args])
  return {cwd, run, tee, turbo, changeset}
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

function execaText(error: unknown): string {
  if (!(error instanceof ExecaError)) return ''
  return [error.message, error.stdout, error.stderr].map(String).join('\n')
}

async function firstPublish(tee: Tee, name: string): Promise<void> {
  await tee('pnpm', ['--filter', name, 'publish', '--access', 'public', '--no-git-checks']).catch((error: unknown) => {
    if (execaText(error).includes('previously published versions')) {
      console.log(
        `${name}: this version already exists on the registry (a stale 404 from the registry cache), continuing`,
      )
      return
    }
    throw error
  })
}

async function wireTrust(tee: Tee, name: string): Promise<void> {
  await tee(
    'npx',
    npmTrust('github', name, '--repo', REPOSITORY, '--file', RELEASE_WORKFLOW, '--allow-publish', '--yes'),
  ).catch((error: unknown) => {
    const text = execaText(error)
    if (/exist/i.test(text)) {
      console.log(`${name}: trusted publisher already configured`)
      return
    }
    if (text.includes('E403')) {
      throw new Error(
        `npm rejected the trust change for ${name} (E403): trust commands need an interactive "npm login" session with 2FA on the account; granular tokens with bypass-2FA are not supported`,
        {cause: error},
      )
    }
    throw error
  })
}

type Tee = Awaited<ReturnType<typeof atRoot>>['tee']

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
    const {cwd, run, tee, turbo} = await atRoot()
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
        await firstPublish(tee, name)
      }
      await wireTrust(tee, name)
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
