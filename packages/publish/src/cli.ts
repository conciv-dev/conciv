#!/usr/bin/env node
import {chmod, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineCommand, runMain} from 'citty'
import {Context, Duration, Effect} from 'effect'
import {execa} from 'execa'
import {z} from 'zod'
import {
  PUBLIC_PACKAGES,
  assertBootstrappable,
  assertChangesetsResolve,
  assertNoDependencyLoop,
  assertPublicDepsPublic,
  assertPublicTypesPublic,
  assertPublicSet,
  assertPublishedChangesCovered,
  assertSharedDependenciesCatalogued,
  assertValidTag,
  assertVersioned,
  assertWorkspaceRoot,
} from './guards.ts'
import {assertTestsWithinBudget} from './test-budget.ts'
import {assertTypecheckCoversTrackedFiles} from './typecheck-coverage.ts'
import {
  assertPluginsDrawThroughContextUi,
  assertTasksDependOnUpstreamBuilds,
  assertTypeTasksDependOnDistReads,
} from './workspace-imports.ts'
import {flaggedLogLevel, logFlags, publishLogs} from './log.ts'
import {buildSyncPlan, pushMissingTags, registryRecord, type SyncPackageState, type SyncPlanEntry} from './sync.ts'
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
const BRIDGE_MANIFEST = 'packages/plugins/ios/package.json'
const MIRROR_COMMIT_NAME = 'conciv-swift-mirror'
const MIRROR_COMMIT_EMAIL = 'noreply@conciv.dev'

async function atRoot(childStdout: 'inherit' | 2 = 'inherit') {
  const cwd = process.cwd()
  await assertWorkspaceRoot(cwd)
  const run = (file: string, args: string[]) => execa(file, args, {cwd, stdio: ['inherit', childStdout, 'inherit']})
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
  args: {
    'require-coverage': {
      type: 'boolean',
      default: false,
      description:
        'Also require every changed non-test code file in a published package to be covered by a changeset naming an @conciv package',
    },
    base: {
      type: 'string',
      description: 'Git ref to diff against HEAD when --require-coverage is set',
    },
  },
  async run({args}) {
    const {cwd} = await atRoot()
    await assertChangesetsResolve(cwd)
    if (args['require-coverage']) {
      if (!args.base) {
        throw new Error('--require-coverage requires --base <ref>')
      }
      await assertPublishedChangesCovered(cwd, args.base)
    }
  },
})

const checkCatalog = defineCommand({
  meta: {
    name: 'check-catalog',
    description:
      'Fail when an external dependency shared by two or more workspace manifests is not taken from the catalog',
  },
  async run() {
    const {cwd} = await atRoot()
    await assertSharedDependenciesCatalogued(cwd)
  },
})

const checkTypecheckCoverage = defineCommand({
  meta: {
    name: 'check-typecheck-coverage',
    description:
      "Fail when a tracked TypeScript file is not in a tsconfig its package's typecheck script runs, nor excluded there by name",
  },
  async run() {
    const {cwd} = await atRoot()
    await assertTypecheckCoversTrackedFiles(cwd)
  },
})

const checkTestBudget = defineCommand({
  meta: {
    name: 'check-test-budget',
    description:
      'Fail when a workspace package has more test cases than test-budget.json allows; a package under its budget prints a note to lower it',
  },
  async run() {
    const {cwd} = await atRoot()
    for (const note of await assertTestsWithinBudget(cwd)) console.log(note)
  },
})

const checkTurboDependsOn = defineCommand({
  meta: {
    name: 'check-turbo-depends-on',
    description:
      'Fail when a turbo.json task depends on a "<package>#<task>" edge or a package build.dependsOn leaves out "^build", or a typecheck is not ordered after the build of a workspace package whose dist its program reads',
  },
  async run() {
    const {cwd} = await atRoot()
    await assertTasksDependOnUpstreamBuilds(cwd)
    await assertTypeTasksDependOnDistReads(cwd)
  },
})

const checkDependencyLoops = defineCommand({
  meta: {
    name: 'check-dependency-loops',
    description:
      'Fail when workspace packages form any loop through dependencies, devDependencies, peerDependencies or optionalDependencies, and print each loop with the field of every edge',
  },
  async run() {
    const {cwd} = await atRoot()
    await assertNoDependencyLoop(cwd)
  },
})

const checkPluginUiKit = defineCommand({
  meta: {
    name: 'check-plugin-ui-kit',
    description:
      'Fail when a plugin under packages/plugins, other than the built-in page and terminal plugins, imports or depends on @conciv/ui-kit* instead of drawing through ctx.ui',
  },
  async run() {
    const {cwd} = await atRoot()
    await assertPluginsDrawThroughContextUi(cwd)
  },
})

const checkPublicTypes = defineCommand({
  meta: {
    name: 'check-public-types',
    description:
      'Fail when a published package declaration file in dist names a private workspace package; run it after the build',
  },
  async run() {
    const {cwd} = await atRoot()
    await assertPublicTypesPublic(cwd)
  },
})

const check = defineCommand({
  meta: {name: 'check', description: 'Validate every package: build + publint + attw'},
  async run() {
    const {cwd, turbo} = await atRoot()
    await turbo('build', 'publint', 'attw')
    await assertPublicTypesPublic(cwd)
  },
})

const release = defineCommand({
  meta: {name: 'release', description: 'Build, validate, then publish to npm via changesets'},
  async run() {
    const {cwd, turbo, changeset} = await atRoot()
    await assertPublicSet(cwd)
    await assertPublicDepsPublic(cwd)
    await assertVersioned(cwd)
    await turbo('build', 'publint', 'attw')
    await assertPublicTypesPublic(cwd)
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
    await assertPublicDepsPublic(cwd)
    await changeset('version', '--snapshot', args.tag)
    await turbo('build', 'publint', 'attw')
    await assertPublicTypesPublic(cwd)
    await changeset('publish', '--tag', args.tag)
  },
})

const npmTrust = (...args: string[]) => ['--yes', 'npm@^11.15.0', 'trust', ...args]

type SyncFailure = {name: string; hint: string; output: string}

const SyncLines = Context.Reference<(line: string) => Effect.Effect<void>>('@internal/publish/SyncLines', {
  defaultValue: () => (line) => Effect.sync(() => process.stdout.write(`${line}\n`)),
})

function say(line: string) {
  return Effect.gen(function* () {
    const write = yield* SyncLines
    yield* write(line)
  })
}

const NPM_CONCURRENCY = 8

function npmCall(name: string, file: string, args: string[], interactive: boolean) {
  const command = `${file} ${args.join(' ')}`
  return Effect.logDebug(`running ${command}`).pipe(
    Effect.andThen(
      Effect.tryPromise({
        try: () =>
          execa(file, args, {
            cwd: process.cwd(),
            stdin: interactive ? 'inherit' : 'ignore',
            stderr: interactive ? 'inherit' : 'pipe',
            all: true,
          }),
        catch: (cause): SyncFailure => ({
          name,
          hint: '',
          output: cause instanceof Error ? cause.message : String(cause),
        }),
      }),
    ),
    Effect.timed,
    Effect.tap(([duration]) => Effect.logDebug(`${command} took ${Duration.format(duration)}`)),
    Effect.map(([, result]) => result),
    Effect.annotateLogs('package', name),
  )
}

function failWith(hint: string) {
  return (failure: SyncFailure) => Effect.fail({...failure, hint})
}

function firstAloneThenConcurrent<A, B>(
  items: readonly A[],
  step: (item: A, interactive: boolean) => Effect.Effect<B, SyncFailure>,
) {
  return Effect.gen(function* () {
    const [head, ...rest] = items
    if (head === undefined) return [[], []] as [B[], SyncFailure[]]
    const [firstPasses, firstFails] = yield* Effect.partition([head], (item) => step(item, true))
    const [passes, fails] = yield* Effect.partition(rest, (item) => step(item, false), {concurrency: NPM_CONCURRENCY})
    return [
      [...firstPasses, ...passes],
      [...firstFails, ...fails],
    ] as [B[], SyncFailure[]]
  })
}

function firstPublish(name: string, interactive: boolean) {
  return npmCall(
    name,
    'pnpm',
    ['--filter', name, 'publish', '--access', 'public', '--no-git-checks'],
    interactive,
  ).pipe(
    Effect.catch(
      failWith(
        'publish failed. If npm reported "previously published versions", the registry 404 cache is stale and the package is fine - rerun sync in a few minutes. If it reported EOTP or E403, run "npm login" (browser + 2FA) and rerun sync from a real terminal.',
      ),
    ),
    Effect.andThen(say(`${name}: published`)),
  )
}

function wireTrust(name: string, interactive: boolean) {
  return npmCall(
    name,
    'npx',
    npmTrust('github', name, '--repo', REPOSITORY, '--file', RELEASE_WORKFLOW, '--allow-publish', '--yes'),
    interactive,
  ).pipe(
    Effect.catch(
      failWith(
        'trust setup failed. npm trust needs a real terminal, an "npm login" browser session, and 2FA on the account (bypass-2FA tokens are rejected). If the 2FA window expired (EOTP), rerun sync.',
      ),
    ),
    Effect.andThen(say(`${name}: trust set up`)),
  )
}

const TrustConfig = z.object({repository: z.string().optional(), file: z.string().optional()})

function trustAlreadySetUp(name: string, interactive: boolean) {
  return npmCall(name, 'npx', npmTrust('list', name, '--json'), interactive).pipe(
    Effect.map(({stdout}) =>
      stdout
        .split(/\n\s*\n/)
        .filter((chunk) => chunk.trim() !== '')
        .map((chunk) => TrustConfig.safeParse(parseJson(chunk)))
        .some(({success, data}) => success && data.repository === REPOSITORY && data.file === RELEASE_WORKFLOW),
    ),
    Effect.catch((failure) =>
      Effect.logWarning(`npm trust list failed, planning trust setup\n${failure.output}`).pipe(
        Effect.annotateLogs('package', name),
        Effect.as(false),
      ),
    ),
    Effect.tap((wired) => (wired ? say(`${name}: trust already set up`) : Effect.void)),
  )
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

type Run = Awaited<ReturnType<typeof atRoot>>['run']
type Turbo = Awaited<ReturnType<typeof atRoot>>['turbo']

const gatherSyncStates = Effect.fn('sync.gatherStates')(function* () {
  const records = yield* Effect.forEach(
    PUBLIC_PACKAGES,
    (name) => Effect.promise(async () => ({name, ...(await registryRecord(name))})),
    {concurrency: 'unbounded'},
  )
  const [wired] = yield* firstAloneThenConcurrent(
    records.filter(({state}) => state === 'untrusted'),
    ({name}, interactive) =>
      trustAlreadySetUp(name, interactive).pipe(Effect.map((trusted) => (trusted ? [name] : []))),
  )
  const trusted = wired.flat()
  return records.map((record): SyncPackageState =>
    trusted.includes(record.name) ? {...record, state: 'trusted'} : record,
  )
})

const printSyncPlan = Effect.fn('sync.printPlan')(function* (
  states: SyncPackageState[],
  plan: SyncPlanEntry[],
  json: boolean,
) {
  const healthy = states.length - plan.length
  if (json) {
    process.stdout.write(`${JSON.stringify({healthy, plan}, null, 2)}\n`)
    return
  }
  for (const {name, state, actions} of plan) {
    yield* say(`${name}: ${state} -> ${actions.join(', ')}`)
  }
  yield* say(`${healthy}/${states.length} packages healthy`)
})

async function buildFirstPublishes(cwd: string, turbo: Turbo, names: string[]): Promise<void> {
  await Promise.all(names.map((name) => assertBootstrappable(cwd, name)))
  if (names.length === 0) return
  await turbo('build', 'publint', 'attw', ...names.map((name) => `--filter=${name}`))
  await assertPublicTypesPublic(cwd, names)
}

function applyNpmActions({name, actions}: SyncPlanEntry, interactive: boolean) {
  return Effect.gen(function* () {
    if (actions.includes('publish')) yield* firstPublish(name, interactive)
    if (actions.includes('trust')) yield* wireTrust(name, interactive && !actions.includes('publish'))
  })
}

const applySyncPlan = Effect.fn('sync.apply')(function* (cwd: string, run: Run, turbo: Turbo, plan: SyncPlanEntry[]) {
  yield* Effect.promise(() =>
    buildFirstPublishes(
      cwd,
      turbo,
      plan.filter(({actions}) => actions.includes('publish')).map(({name}) => name),
    ),
  )
  const [, failures] = yield* firstAloneThenConcurrent(
    plan.filter(({actions}) => actions.includes('publish') || actions.includes('trust')),
    applyNpmActions,
  )
  for (const {name, hint, output} of failures) {
    yield* Effect.logError(output).pipe(Effect.annotateLogs('package', name))
    yield* say(`${name}: ${hint}`)
  }
  if (failures.length > 0) {
    return yield* Effect.fail(
      new Error(
        `sync failed for ${failures.map(({name}) => name).join(', ')}; tags not pushed. Rerun sync, it is idempotent.`,
      ),
    )
  }
  yield* Effect.promise(() => run('pnpm', ['exec', 'changeset', 'git-tag']))
  yield* Effect.promise(() =>
    pushMissingTags(
      cwd,
      plan.filter(({actions}) => actions.includes('tag')).map(({name}) => name),
    ),
  )
})

const syncProgram = Effect.fn('sync')(function* (dryRun: boolean, json: boolean) {
  const {cwd, run, turbo} = yield* Effect.promise(() => atRoot(json ? 2 : 'inherit'))
  yield* Effect.promise(() => assertPublicDepsPublic(cwd))
  const {stdout: user} = yield* Effect.promise(() =>
    execa('npm', ['whoami'], {cwd, stdin: 'inherit', stderr: 'inherit'}),
  )
  yield* say(`npm user: ${user.trim()}`)
  const states = yield* gatherSyncStates()
  const plan = yield* Effect.promise(() => buildSyncPlan(cwd, states))
  yield* printSyncPlan(states, plan, json)
  if (plan.length === 0 || dryRun) return
  yield* applySyncPlan(cwd, run, turbo, plan)
})

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
    ...logFlags,
  },
  async run({args}) {
    await Effect.runPromise(
      syncProgram(args['dry-run'], args.json).pipe(
        args.json ? Effect.provideService(SyncLines, (line) => Effect.logInfo(line)) : (program) => program,
        Effect.provide(publishLogs('sync', flaggedLogLevel(args))),
      ),
    )
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
      'Regenerate the conciv-swift SDK mirror from native/swift/ConcivWidget and tag it with the @conciv/plugin-ios version. Idempotent: skips if the tag already exists.',
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
      `conciv-swift ${sdkVersion} is already tagged but the assembled tree differs: the mirror source changed without a @conciv/plugin-ios version bump. Check the release flow (changesets should bump the version on every release).`,
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
    'check-catalog': checkCatalog,
    'check-typecheck-coverage': checkTypecheckCoverage,
    'check-test-budget': checkTestBudget,
    'check-turbo-depends-on': checkTurboDependsOn,
    'check-dependency-loops': checkDependencyLoops,
    'check-plugin-ui-kit': checkPluginUiKit,
    'check-public-types': checkPublicTypes,
    check,
    release,
    snapshot,
    sync,
    'swift-mirror': swiftMirror,
  },
})

runMain(main)
