#!/usr/bin/env node
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineCommand, runMain} from 'citty'
import {execa} from 'execa'
import {findRoot} from './workspace-root.ts'
import {PUBLIC_PACKAGES, assertBootstrappable, assertPublicSet, assertValidTag, assertVersioned} from './guards.ts'
import {registryState} from './registry.ts'
import {assembleMirrorTree} from './swift-mirror.ts'

const REPOSITORY = 'conciv-dev/conciv'
const RELEASE_WORKFLOW = 'release.yml'
const MIRROR_REPOSITORY = 'conciv-dev/conciv-swift'
const MIRROR_SOURCE = 'native/swift/ConcivWidget'
const MIRROR_TEMPLATE = 'native/swift/mirror'
const MIRROR_COMMIT_NAME = 'conciv-swift-mirror'
const MIRROR_COMMIT_EMAIL = 'noreply@conciv.dev'

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

function mirrorUrl(token: string): string {
  return `https://x-access-token:${token}@github.com/${MIRROR_REPOSITORY}.git`
}

async function mirrorTagExists(url: string, tag: string): Promise<boolean> {
  const {stdout} = await execa('git', ['ls-remote', '--tags', url, `refs/tags/${tag}`])
  return stdout.trim().length > 0
}

async function pushMirror(workdir: string, url: string, tag: string): Promise<void> {
  const git = (...args: string[]) => execa('git', ['-C', workdir, ...args], {stdio: 'inherit'})
  await git('init', '-q')
  await git('checkout', '-q', '-B', 'main')
  await git('remote', 'add', 'origin', url)
  await git('add', '-A')
  const author = ['-c', `user.name=${MIRROR_COMMIT_NAME}`, '-c', `user.email=${MIRROR_COMMIT_EMAIL}`]
  await git(...author, 'commit', '-q', '-m', `chore: release ConcivWidget ${tag}`)
  await git('tag', tag)
  await git('push', '--force', 'origin', 'main')
  await git('push', 'origin', tag)
}

const swiftMirror = defineCommand({
  meta: {
    name: 'swift-mirror',
    description:
      'Regenerate the conciv-swift SDK mirror from native/swift/ConcivWidget and tag it with SWIFT_SDK_VERSION. Idempotent: skips if the tag already exists.',
  },
  args: {
    'dry-run': {
      type: 'boolean',
      default: false,
      description: 'Assemble the mirror tree and report the plan without cloning, tagging, or pushing',
    },
  },
  async run({args}) {
    const cwd = await findRoot(process.cwd())
    const sourceDir = join(cwd, MIRROR_SOURCE)
    const templateDir = join(cwd, MIRROR_TEMPLATE)
    const destDir = await mkdtemp(join(tmpdir(), 'conciv-swift-'))
    const tree = await assembleMirrorTree({sourceDir, templateDir, destDir})
    console.log(`assembled conciv-swift ${tree.version} at ${destDir}: ${tree.files.join(', ')}`)
    if (args['dry-run']) {
      console.log(`dry run: skipping tag lookup and push for ${MIRROR_REPOSITORY}`)
      return
    }
    const token = process.env.GH_MIRROR_TOKEN
    if (!token) {
      throw new Error(
        'GH_MIRROR_TOKEN is required to publish the conciv-swift mirror (a PAT with push access to conciv-dev/conciv-swift)',
      )
    }
    const url = mirrorUrl(token)
    if (await mirrorTagExists(url, tree.version)) {
      console.log(`conciv-swift ${tree.version} already tagged on ${MIRROR_REPOSITORY}; nothing to publish`)
      return
    }
    await pushMirror(destDir, url, tree.version)
    console.log(`published conciv-swift ${tree.version} to ${MIRROR_REPOSITORY}`)
  },
})

const main = defineCommand({
  meta: {name: 'conciv-publish', description: 'Release tooling for the aidx monorepo'},
  subCommands: {version, check, release, snapshot, sync, 'swift-mirror': swiftMirror},
})

runMain(main)
