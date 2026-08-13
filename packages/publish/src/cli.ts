#!/usr/bin/env node
import {chmod, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineCommand, runMain} from 'citty'
import {execa} from 'execa'
import {
  PUBLIC_PACKAGES,
  assertBootstrappable,
  assertChangesetsResolve,
  assertPublicSet,
  assertValidTag,
  assertVersioned,
  assertWorkspaceRoot,
} from './guards.ts'
import {registryState} from './registry.ts'
import {
  assembleMirrorTree,
  extractCommitSubtree,
  readBridgeVersion,
  resolveVersionCommit,
  treesMatch,
} from './swift-mirror.ts'

const REPOSITORY = 'conciv-dev/conciv'
const RELEASE_WORKFLOW = 'release.yml'
const MIRROR_REPOSITORY = 'conciv-dev/conciv-swift'
const MIRROR_TREE = 'native/swift'
const MIRROR_SOURCE_SUBDIR = 'ConcivWidget'
const MIRROR_TEMPLATE_SUBDIR = 'mirror'
const BRIDGE_MANIFEST = 'packages/extensions/ios/package.json'
const MIRROR_COMMIT_NAME = 'conciv-swift-mirror'
const MIRROR_COMMIT_EMAIL = 'noreply@conciv.dev'

async function atRoot() {
  const cwd = process.cwd()
  await assertWorkspaceRoot(cwd)
  const run = (file: string, args: string[]) => execa(file, args, {cwd, stdio: 'inherit'})
  const turbo = (...tasks: string[]) => run('pnpm', ['exec', 'turbo', 'run', ...tasks])
  const changeset = (...args: string[]) => run('pnpm', ['exec', 'changeset', ...args])
  return {cwd, run, turbo, changeset}
}

const version = defineCommand({
  meta: {name: 'version', description: 'Consume changesets, bump versions, resync the lockfile'},
  async run() {
    const {cwd, run, changeset} = await atRoot()
    await assertChangesetsResolve(cwd)
    await changeset('version')
    await run('pnpm', ['install', '--lockfile-only'])
  },
})

const checkChangesets = defineCommand({
  meta: {name: 'check-changesets', description: 'Validate every changeset names an existing workspace package'},
  async run() {
    const {cwd} = await atRoot()
    await assertChangesetsResolve(cwd)
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

const MIRROR_URL = `https://x-access-token@github.com/${MIRROR_REPOSITORY}.git`

const mirrorGit = async (env: NodeJS.ProcessEnv, args: string[], workdir?: string): Promise<{stdout: string}> => {
  const result = await execa('git', workdir ? ['-C', workdir, ...args] : args, {
    env,
    stdio: workdir ? 'inherit' : 'pipe',
  })
  return {stdout: typeof result.stdout === 'string' ? result.stdout : ''}
}

async function withMirrorAuth<T>(
  run: (git: (args: string[], workdir?: string) => Promise<{stdout: string}>) => Promise<T>,
): Promise<T> {
  const token = process.env.GH_MIRROR_TOKEN
  if (!token) {
    throw new Error(
      'GH_MIRROR_TOKEN is required to publish the conciv-swift mirror (a PAT with push access to conciv-dev/conciv-swift)',
    )
  }
  const askpassDir = await mkdtemp(join(tmpdir(), 'conciv-askpass-'))
  const askpass = join(askpassDir, 'askpass.sh')
  await writeFile(askpass, `#!/bin/sh\nprintf '%s' "$GH_MIRROR_TOKEN"\n`)
  await chmod(askpass, 0o700)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GH_MIRROR_TOKEN: token,
    GIT_ASKPASS: askpass,
    GIT_TERMINAL_PROMPT: '0',
  }
  try {
    return await run((args, workdir) => mirrorGit(env, args, workdir))
  } finally {
    await rm(askpassDir, {recursive: true, force: true})
  }
}

async function mirrorTagExists(
  git: (args: string[], workdir?: string) => Promise<{stdout: string}>,
  tag: string,
): Promise<boolean> {
  const {stdout} = await git(['ls-remote', '--tags', MIRROR_URL, `refs/tags/${tag}`])
  return stdout.trim().length > 0
}

async function cloneTaggedTree(
  git: (args: string[], workdir?: string) => Promise<{stdout: string}>,
  tag: string,
  into: string,
): Promise<void> {
  await git(['clone', '--quiet', '--depth', '1', '--branch', tag, MIRROR_URL, into])
}

async function pushMirror(
  git: (args: string[], workdir?: string) => Promise<{stdout: string}>,
  workdir: string,
  tag: string,
): Promise<void> {
  const run = (...args: string[]) => git(args, workdir)
  await run('init', '-q')
  await run('checkout', '-q', '-B', 'main')
  await run('remote', 'add', 'origin', MIRROR_URL)
  await run('add', '-A')
  const author = ['-c', `user.name=${MIRROR_COMMIT_NAME}`, '-c', `user.email=${MIRROR_COMMIT_EMAIL}`]
  await run(...author, 'commit', '-q', '-m', `chore: release ConcivWidget ${tag}`)
  await run('tag', tag)
  await run('push', '--force', 'origin', 'main')
  await run('push', 'origin', tag)
}

const swiftMirror = defineCommand({
  meta: {
    name: 'swift-mirror',
    description:
      'Regenerate the conciv-swift SDK mirror from native/swift/ConcivWidget and tag it with the @conciv/extension-ios version. Idempotent: skips if the tag already exists.',
  },
  args: {
    'dry-run': {
      type: 'boolean',
      default: false,
      description: 'Assemble the mirror tree and report the plan without cloning, tagging, or pushing',
    },
  },
  async run({args}) {
    const cwd = process.cwd()
    await assertWorkspaceRoot(cwd)
    const bridgeManifestPath = join(cwd, BRIDGE_MANIFEST)
    const bridgeVersion = await readBridgeVersion(bridgeManifestPath)
    const releaseCommit = await resolveVersionCommit(cwd, BRIDGE_MANIFEST, bridgeVersion)
    const treeDir = await mkdtemp(join(tmpdir(), 'conciv-swift-src-'))
    const destDir = await mkdtemp(join(tmpdir(), 'conciv-swift-'))
    try {
      await extractCommitSubtree(cwd, releaseCommit, MIRROR_TREE, treeDir)
      const tree = await assembleMirrorTree({
        sourceDir: join(treeDir, MIRROR_SOURCE_SUBDIR),
        templateDir: join(treeDir, MIRROR_TEMPLATE_SUBDIR),
        destDir,
        bridgeManifestPath,
      })
      console.log(
        `assembled conciv-swift ${tree.version} from ${releaseCommit.slice(0, 12)} at ${destDir}: ${tree.files.join(', ')}`,
      )
      if (args['dry-run']) {
        console.log(`dry run: skipping tag lookup and push for ${MIRROR_REPOSITORY}`)
        return
      }
      await withMirrorAuth((git) => publishMirror(git, destDir, tree.version))
    } finally {
      await rm(treeDir, {recursive: true, force: true})
      await rm(destDir, {recursive: true, force: true})
    }
  },
})

async function publishMirror(
  git: (args: string[], workdir?: string) => Promise<{stdout: string}>,
  destDir: string,
  sdkVersion: string,
): Promise<void> {
  if (await mirrorTagExists(git, sdkVersion)) {
    await assertTaggedTreeMatches(git, destDir, sdkVersion)
    console.log(`conciv-swift ${sdkVersion} already tagged on ${MIRROR_REPOSITORY} and identical; nothing to publish`)
    return
  }
  await pushMirror(git, destDir, sdkVersion)
  console.log(`published conciv-swift ${sdkVersion} to ${MIRROR_REPOSITORY}`)
}

async function assertTaggedTreeMatches(
  git: (args: string[], workdir?: string) => Promise<{stdout: string}>,
  destDir: string,
  sdkVersion: string,
): Promise<void> {
  const tagDir = await mkdtemp(join(tmpdir(), 'conciv-swift-tag-'))
  try {
    await cloneTaggedTree(git, sdkVersion, tagDir)
    if (await treesMatch(destDir, tagDir)) return
    throw new Error(
      `conciv-swift ${sdkVersion} is already tagged but the assembled tree differs: the mirror source changed without a @conciv/extension-ios version bump. Check the release flow (changesets should bump the version on every release).`,
    )
  } finally {
    await rm(tagDir, {recursive: true, force: true})
  }
}

const main = defineCommand({
  meta: {name: 'conciv-publish', description: 'Release tooling for the aidx monorepo'},
  subCommands: {
    version,
    'check-changesets': checkChangesets,
    check,
    release,
    snapshot,
    sync,
    'swift-mirror': swiftMirror,
  },
})

runMain(main)
