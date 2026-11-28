#!/usr/bin/env node
import {chmod, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineCommand, runCommand, runMain} from 'citty'
import * as clack from '@clack/prompts'
import {Duration, Effect} from 'effect'
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
import {checkNodeFloor} from './node-floor.ts'
import {
  buildSyncPlan,
  pushMissingTags,
  registryRecord,
  type RegistryState,
  type SyncPackageState,
  type SyncPlanEntry,
} from './sync.ts'
import {
  assembleMirrorTree,
  extractCommitSubtree,
  readBridgeVersion,
  resolveVersionCommit,
  treesMatch,
} from './swift-mirror.ts'
import {publishErrors} from './errors/errors.ts'
import {formatCliError} from './errors/format.ts'

const REPOSITORY = 'conciv-dev/conciv'
const RELEASE_WORKFLOW = 'release.yml'
const MIRROR_REPOSITORY = 'conciv-dev/conciv-swift'
const MIRROR_TREE = 'native/swift'
const MIRROR_SOURCE_SUBDIR = 'ConcivWidget'
const MIRROR_TEMPLATE_SUBDIR = 'mirror'
const BRIDGE_MANIFEST = 'packages/plugins/ios/package.json'
const MIRROR_COMMIT_NAME = 'conciv-swift-mirror'
const MIRROR_COMMIT_EMAIL = 'noreply@conciv.dev'

function validateTasks(names: readonly string[]) {
  return ['build', 'publint', 'attw', ...names.map((name) => `--filter=${name}`)]
}

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
        throw publishErrors.COVERAGE_NEEDS_BASE()
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

const checkNodeFloorCommand = defineCommand({
  meta: {
    name: 'check-node-floor',
    description:
      'Pack the published packages, install them into a throwaway consumer and prove them on the Node binary given (the engines.node floor in CI): the cli runs, every node entry imports, the engine starts in simulation and lists a session it created; then install them with npm into an app shaped like a Vite project and prove the cli and the engine again; run it after the build',
  },
  args: {
    node: {type: 'string', default: process.execPath, description: 'the Node binary the proofs run on'},
  },
  async run({args}) {
    const {cwd} = await atRoot()
    await checkNodeFloor(cwd, args.node)
  },
})

const check = defineCommand({
  meta: {name: 'check', description: 'Validate every published package: build + publint + attw'},
  async run() {
    const {cwd, turbo} = await atRoot()
    await turbo(...validateTasks(PUBLIC_PACKAGES))
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
    await turbo(...validateTasks(PUBLIC_PACKAGES))
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
    await turbo(...validateTasks(PUBLIC_PACKAGES))
    await assertPublicTypesPublic(cwd)
    await changeset('publish', '--tag', args.tag)
  },
})

const NPM_FLOOR = [11, 15, 0]

type SyncFailure = {name: string; hint: string; output: string}

type SyncView = {
  status: (text: string) => Effect.Effect<void>
  pause: Effect.Effect<void>
  line: (text: string) => Effect.Effect<void>
  warn: (text: string) => Effect.Effect<void>
  list: (title: string, lines: string[]) => Effect.Effect<void>
}

function terminalView(): SyncView {
  const indicator = clack.spinner()
  let spinning = false
  const pause = Effect.sync(() => {
    if (spinning) indicator.clear()
    spinning = false
  })
  return {
    status: (text) =>
      Effect.sync(() => {
        if (spinning) indicator.message(text)
        else indicator.start(text)
        spinning = true
      }),
    pause,
    line: (text) => pause.pipe(Effect.andThen(Effect.sync(() => clack.log.success(text)))),
    warn: (text) => pause.pipe(Effect.andThen(Effect.sync(() => clack.log.warn(text)))),
    list: (title, lines) => pause.pipe(Effect.andThen(Effect.sync(() => clack.note(lines.join('\n'), title)))),
  }
}

function jsonView(): SyncView {
  return {
    status: (text) => Effect.logDebug(text),
    pause: Effect.void,
    line: (text) => Effect.logInfo(text),
    warn: (text) => Effect.logWarning(text),
    list: (title, lines) => Effect.logInfo(`${title}\n${lines.join('\n')}`),
  }
}

function npmCall<A>(name: string, file: string, args: string[], spawn: () => Promise<A>) {
  const command = `${file} ${args.join(' ')}`
  return Effect.logDebug(`running ${command}`).pipe(
    Effect.andThen(
      Effect.tryPromise({
        try: spawn,
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

function npmOnTerminal(view: SyncView, run: Run, name: string, file: string, args: string[]) {
  return view.pause.pipe(Effect.andThen(npmCall(name, file, args, () => run(file, args))), Effect.asVoid)
}

function readTrustList(name: string) {
  const args = ['trust', 'list', name, '--json']
  return npmCall(name, 'npm', args, () => execa('npm', args, {cwd: process.cwd(), stdin: 'ignore', all: true})).pipe(
    Effect.map(({stdout}) => stdout),
  )
}

const TrustConfig = z.object({repository: z.string().optional(), file: z.string().optional()})

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function namesReleaseWorkflow(output: string): boolean {
  return output
    .split(/\n\s*\n/)
    .filter((chunk) => chunk.trim() !== '')
    .map((chunk) => TrustConfig.safeParse(parseJson(chunk)))
    .some(({success, data}) => success && data.repository === REPOSITORY && data.file === RELEASE_WORKFLOW)
}

function readTrustState(name: string) {
  return readTrustList(name).pipe(
    Effect.map((output): RegistryState => (namesReleaseWorkflow(output) ? 'trusted' : 'untrusted')),
    Effect.catch((failure) =>
      Effect.logWarning(`npm trust list failed\n${failure.output}`).pipe(
        Effect.annotateLogs('package', name),
        Effect.as<RegistryState>('unknown'),
      ),
    ),
  )
}

function failWith(hint: string) {
  return (failure: SyncFailure) => Effect.fail({...failure, hint})
}

function firstPublish(view: SyncView, run: Run, name: string) {
  return view
    .status(`${name}: publishing`)
    .pipe(
      Effect.andThen(
        npmOnTerminal(view, run, name, 'pnpm', [
          '--filter',
          name,
          'publish',
          '--access',
          'public',
          '--no-git-checks',
        ]).pipe(
          Effect.catch(
            failWith(
              'publish failed. If npm reported "previously published versions", the registry 404 cache is stale and the package is fine - rerun sync in a few minutes. If it reported EOTP or E403, run "npm login" (browser + 2FA) and rerun sync from a real terminal.',
            ),
          ),
        ),
      ),
      Effect.andThen(view.line(`${name}: published`)),
    )
}

function wireTrust(view: SyncView, run: Run, name: string) {
  return view.status(`${name}: setting up trust`).pipe(
    Effect.andThen(
      npmOnTerminal(view, run, name, 'npm', [
        'trust',
        'github',
        name,
        '--repo',
        REPOSITORY,
        '--file',
        RELEASE_WORKFLOW,
        '--allow-publish',
        '--yes',
      ]),
    ),
    Effect.catch((failure) =>
      readTrustState(name).pipe(Effect.flatMap((state) => (state === 'trusted' ? Effect.void : Effect.fail(failure)))),
    ),
    Effect.catch(
      failWith(
        'trust setup failed. npm trust needs a real terminal, an "npm login" browser session, and 2FA on the account (bypass-2FA tokens are rejected). If the 2FA window expired (EOTP), rerun sync.',
      ),
    ),
    Effect.andThen(view.line(`${name}: trust set up`)),
  )
}

type Run = Awaited<ReturnType<typeof atRoot>>['run']
type Turbo = Awaited<ReturnType<typeof atRoot>>['turbo']

function atLeast(installed: string, floor: number[]): boolean {
  const parts = installed.split('.').map((part) => Number.parseInt(part, 10))
  const index = floor.findIndex((value, at) => (parts[at] ?? 0) !== value)
  return index === -1 || (parts[index] ?? 0) > (floor[index] ?? 0)
}

const assertNpmFloor = Effect.fn('sync.assertNpmFloor')(function* (cwd: string) {
  const {stdout} = yield* Effect.promise(() => execa('npm', ['--version'], {cwd}))
  if (!atLeast(stdout.trim(), NPM_FLOOR)) {
    return yield* Effect.fail(publishErrors.NPM_TOO_OLD({version: stdout.trim()}))
  }
})

const gatherSyncStates = Effect.fn('sync.gatherStates')(function* (view: SyncView, run: Run) {
  const total = PUBLIC_PACKAGES.length
  let read = 0
  let present = 0
  let checked = 0
  const progress = () => view.status(`reading npm ${read}/${total}, checking trust ${checked}/${present}`)
  const states = yield* Effect.forEach(
    PUBLIC_PACKAGES,
    (name) =>
      Effect.promise(() => registryRecord(name)).pipe(
        Effect.tap(({exists}) =>
          Effect.sync(() => {
            read += 1
            if (exists) present += 1
          }).pipe(Effect.andThen(progress())),
        ),
        Effect.flatMap(({exists, versions}) =>
          exists
            ? readTrustState(name).pipe(
                Effect.tap(() => Effect.sync(() => (checked += 1)).pipe(Effect.andThen(progress()))),
                Effect.map((state): SyncPackageState => ({name, state, versions})),
              )
            : Effect.succeed<SyncPackageState>({name, state: 'missing', versions}),
        ),
      ),
    {concurrency: 'unbounded'},
  )
  const unknown = states.filter(({state}) => state === 'unknown')
  const [first] = unknown
  if (first === undefined) return states
  yield* view.warn(
    `npm did not answer the trust read for ${unknown.length} packages; it may want 2FA. Approve it once below.`,
  )
  yield* npmOnTerminal(view, run, first.name, 'npm', ['trust', 'list', first.name, '--json']).pipe(Effect.ignore)
  checked = 0
  present = unknown.length
  read = total
  const reread = yield* Effect.forEach(
    unknown,
    (entry) =>
      readTrustState(entry.name).pipe(
        Effect.tap(() => Effect.sync(() => (checked += 1)).pipe(Effect.andThen(progress()))),
        Effect.map((state): SyncPackageState => ({...entry, state})),
      ),
    {concurrency: 'unbounded'},
  )
  return states.map((entry) => reread.find(({name}) => name === entry.name) ?? entry)
})

const printSyncPlan = Effect.fn('sync.printPlan')(function* (
  view: SyncView,
  states: SyncPackageState[],
  plan: SyncPlanEntry[],
  unknown: string[],
  json: boolean,
) {
  const healthy = states.length - plan.length - unknown.length
  if (json) {
    process.stdout.write(`${JSON.stringify({healthy, plan, unknown}, null, 2)}\n`)
    return
  }
  yield* view.list('Plan', [
    ...plan.map(({name, state, actions}) => `${name}: ${state} -> ${actions.join(' + ')}`),
    `${healthy} packages healthy`,
  ])
  if (unknown.length > 0) {
    yield* view.warn(`trust could not be read, nothing planned for: ${unknown.join(', ')}`)
  }
})

async function buildFirstPublishes(cwd: string, turbo: Turbo, names: string[]): Promise<void> {
  await Promise.all(names.map((name) => assertBootstrappable(cwd, name)))
  if (names.length === 0) return
  await turbo(...validateTasks(names))
  await assertPublicTypesPublic(cwd, names)
}

function applyNpmActions(view: SyncView, run: Run, {name, actions}: SyncPlanEntry) {
  return Effect.gen(function* () {
    if (actions.includes('publish')) yield* firstPublish(view, run, name)
    if (actions.includes('trust')) yield* wireTrust(view, run, name)
  })
}

const applySyncPlan = Effect.fn('sync.apply')(function* (
  view: SyncView,
  cwd: string,
  run: Run,
  turbo: Turbo,
  plan: SyncPlanEntry[],
) {
  const firstPublishes = plan.filter(({actions}) => actions.includes('publish')).map(({name}) => name)
  if (firstPublishes.length > 0) yield* view.line(`building ${firstPublishes.join(', ')}`)
  yield* view.pause
  yield* Effect.promise(() => buildFirstPublishes(cwd, turbo, firstPublishes))
  const [, failures] = yield* Effect.partition(
    plan.filter(({actions}) => actions.includes('publish') || actions.includes('trust')),
    (entry) => applyNpmActions(view, run, entry),
  )
  yield* view.pause
  for (const {name, hint, output} of failures) {
    yield* Effect.logError(output).pipe(Effect.annotateLogs('package', name))
    yield* view.warn(`${name}: ${hint}`)
  }
  return failures.map(({name}) => name)
})

const pushTags = Effect.fn('sync.pushTags')(function* (view: SyncView, cwd: string, run: Run, plan: SyncPlanEntry[]) {
  yield* view.pause
  yield* Effect.promise(() => run('pnpm', ['exec', 'changeset', 'git-tag']))
  yield* Effect.promise(() =>
    pushMissingTags(
      cwd,
      plan.filter(({actions}) => actions.includes('tag')).map(({name}) => name),
    ),
  )
})

const syncProgram = Effect.fn('sync')(function* (dryRun: boolean, json: boolean) {
  const view = json ? jsonView() : terminalView()
  const {cwd, run, turbo} = yield* Effect.promise(() => atRoot(json ? 2 : 'inherit'))
  yield* assertNpmFloor(cwd)
  const [, , states] = yield* Effect.all(
    [
      Effect.promise(() => assertPublicDepsPublic(cwd)),
      Effect.promise(() => execa('npm', ['whoami'], {cwd, stdin: 'inherit', stderr: 'inherit'})).pipe(
        Effect.flatMap(({stdout}) => view.line(`npm user: ${stdout.trim()}`)),
      ),
      gatherSyncStates(view, run),
    ],
    {concurrency: 'unbounded'},
  )
  const unknown = states.filter(({state}) => state === 'unknown').map(({name}) => name)
  const plan = yield* Effect.promise(() => buildSyncPlan(cwd, states))
  yield* printSyncPlan(view, states, plan, unknown, json)
  const failed = plan.length === 0 || dryRun ? [] : yield* applySyncPlan(view, cwd, run, turbo, plan)
  const names = [...failed, ...unknown]
  if (names.length > 0) return yield* Effect.fail(publishErrors.SYNC_FAILED({names: names.join(', ')}))
  if (plan.length > 0 && !dryRun) yield* pushTags(view, cwd, run, plan)
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
      syncProgram(args['dry-run'], args.json).pipe(Effect.provide(publishLogs('sync', flaggedLogLevel(args)))),
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
    throw publishErrors.MIRROR_TOKEN_MISSING()
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
    throw publishErrors.MIRROR_TAG_DIFFERS({version: sdkVersion})
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
    'check-node-floor': checkNodeFloorCommand,
    check,
    release,
    snapshot,
    sync,
    'swift-mirror': swiftMirror,
  },
})

const rawArgs = process.argv.slice(2)
if (rawArgs.length === 0 || rawArgs.includes('--help') || rawArgs.includes('-h')) void runMain(main)
else
  void runCommand(main, {rawArgs}).catch((error: unknown) => {
    process.stderr.write(`${formatCliError(error)}\n`)
    process.exitCode = 1
  })
