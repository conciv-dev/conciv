import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {readFile, watch} from 'node:fs/promises'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Deferred, Effect, Fiber, Layer, type FileSystem, type Path} from 'effect'
import {NodeChildProcessSpawner, NodeFileSystem, NodePath} from '@effect/platform-node'
import {keyBy} from 'es-toolkit'
import {describe, expect, it, onTestFinished} from 'vitest'
import {z} from 'zod'
import type {Grab} from '@conciv/grab'
import {connectMcpClient, makeDiscoverTools, makeRpcClient} from '@conciv/harness-testkit'
import {readApprovalAsk} from '@conciv/protocol/chat-event-types'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import {
  BridgeAckSchema,
  BridgeIncompatibleSchema,
  BridgeMessageSchema,
  BridgeReadySchema,
  CloseSchema,
  GrabCancelSchema,
  GrabCapabilitySchema,
  GrabPickSchema,
  GrabResultSchema,
  HandshakeHelloSchema,
  HandshakeSchema,
  HostLogSchema,
  HostPanelToggledSchema,
  NativeToPageSchema,
  OpenSchema,
  type NeutralGrabAsGrab,
  SUBTREE_MAX_DEPTH,
  SUBTREE_MAX_NODES,
} from '../src/bridge.js'
import {makeBuild, parseXcodebuildAppPath} from '../src/build.js'
import {IosConfigSchema, type IosConfig} from '../src/config.js'
import {iosSystemPrompt} from '../src/prompt.js'
import type {IosRuntime} from '../src/config.js'
import * as Simctl from '../src/simctl.js'
import {nativePageBase} from '../src/native/page-base.js'
import {logs, run, screenshot, type RunFailure} from '../src/tools.js'
import {bridgeFixtures, nativeEncodeFixtures} from './fixtures/bridge/bridge.fixtures.js'

const platform = Layer.merge(NodeFileSystem.layer, NodePath.layer)

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

const NotConfiguredSchema = z.strictObject({ok: z.literal(false), error: z.string()})

const NOT_CONFIGURED = {ok: false, error: 'ios plugin not configured'}

const SYSTEM_RECORDER = `import {appendFileSync} from 'node:fs'
export default {
  id: 'system-recorder',
  async setup(ctx) {
    const hooked = {context: false}
    await ctx.session.hook('prompt', async () => {
      if (hooked.context) return
      hooked.context = true
      await ctx.session.hook('context', (event) => {
        appendFileSync(ctx.options.out, JSON.stringify(event.system.map((part) => part.text)) + '\\n')
      })
    })
  },
}
`

async function boot(
  options?: Record<string, string>,
  recorded?: NonNullable<Parameters<typeof bootCoreKit>[0]['plugins']>,
): Promise<CoreKit> {
  const kit = await bootCoreKit({
    id: 'fake',
    plugins: [options === undefined ? PACKAGE_DIR : [PACKAGE_DIR, options], ...(recorded ?? [])],
  })
  onTestFinished(() => kit.cleanup())
  return kit
}

async function systemPromptsSent(options?: Record<string, string>): Promise<{kit: CoreKit; system: string[]}> {
  const directory = tempDir('conciv-ios-system-')
  const recorder = join(directory, 'system-recorder')
  const out = join(directory, 'system.jsonl')
  mkdirSync(recorder)
  writeFileSync(join(recorder, 'package.json'), JSON.stringify({type: 'module'}))
  writeFileSync(join(recorder, 'index.js'), SYSTEM_RECORDER)
  const kit = await boot(options, [[recorder, {out}]])
  expect((await (await kit.turn('hello', {session: await kit.session()})).done()).errors()).toEqual([])
  const [line] = readFileSync(out, 'utf8').trim().split('\n')
  return {kit, system: z.array(z.string()).parse(JSON.parse(line ?? ''))}
}

async function directTool(kit: CoreKit, name: string, input: Record<string, unknown> = {}): Promise<unknown> {
  const mcp = await connectMcpClient(`${kit.base}/api/mcp`, {[CONCIV_SESSION_HEADER]: await kit.session()})
  try {
    const tool = (await mcp.tools()).find((entry) => entry.name === name)
    if (!tool) throw new Error(`${name} is not a direct tool on /api/mcp`)
    return JSON.parse(z.string().parse(await tool.execute(input)))
  } finally {
    await mcp.close()
  }
}

async function directToolNames(kit: CoreKit): Promise<string[]> {
  const mcp = await connectMcpClient(`${kit.base}/api/mcp`)
  try {
    return (await mcp.tools()).map((tool) => tool.name)
  } finally {
    await mcp.close()
  }
}

async function deniedAsk(kit: CoreKit, name: string): Promise<{toolName: string; failure: unknown}> {
  const session = await kit.session()
  const events = await kit.events(session)
  const settled = directTool(kit, name).then(
    () => new Error(`${name} answered instead of being denied`),
    (error: unknown) => error,
  )
  const asked = readApprovalAsk(await events.waitFor((event) => readApprovalAsk(event) !== null))
  if (asked === null) throw new Error(`${name} raised no permission ask`)
  const client = makeRpcClient(kit.base, {headers: {[CONCIV_SESSION_HEADER]: session}})
  await client.chat.permissionDecision({approvalId: asked.approvalId, approved: false, scope: 'once'})
  return {toolName: asked.toolName, failure: await settled}
}

describe('the ios plugin in an engine', () => {
  it('offers screenshot and logs in code mode, keeps build and run direct, and answers not configured from every tool', async () => {
    const kit = await boot()

    const plugin = (await kit.rpc.plugin.list()).data.find((entry) => entry.id === 'ios')
    expect(plugin?.state).toEqual({status: 'active'})

    const discover = makeDiscoverTools(kit.base, await kit.session())
    const read = await discover(['ios_screenshot', 'ios_logs'])
    expect(read.tools.map((tool) => tool.name)).toEqual(['external_ios_screenshot', 'external_ios_logs'])
    for (const tool of read.tools) expect(tool.description, tool.name).not.toBe('')
    const asking = await discover(['ios_build', 'ios_run'])
    expect(asking.tools).toEqual([])
    expect(asking.errors).toHaveLength(2)

    const direct = await directToolNames(kit)
    expect(direct).toEqual(expect.arrayContaining(['ios_build', 'ios_run']))
    expect(direct).not.toContain('ios_screenshot')
    expect(direct).not.toContain('ios_logs')

    expect(NotConfiguredSchema.parse(await kit.callTool('ios_logs', {}))).toEqual(NOT_CONFIGURED)
    expect(NotConfiguredSchema.parse(await kit.callTool('ios_screenshot', {}))).toEqual(NOT_CONFIGURED)
    expect(await directTool(kit, 'ios_build')).toEqual(NOT_CONFIGURED)
    expect(await directTool(kit, 'ios_run')).toEqual(NOT_CONFIGURED)
  })

  it('fails to load with a tagged InvalidOptions naming the bad option when the options do not parse', async () => {
    const kit = await boot({projectRoot: 'PayApp'})

    const plugin = (await kit.rpc.plugin.list()).data.find((entry) => entry.id === 'ios')
    expect(plugin?.state).toEqual({
      status: 'failed',
      error: expect.stringMatching(/^failed to load plugin: InvalidOptions: .*bundleId/s),
    })
  })

  it('asks before building or running a configured app, and a denial runs nothing', async () => {
    const kit = await boot({projectRoot: 'PayApp', bundleId: 'dev.conciv.pay', buildMode: 'swiftc'})

    const buildAsk = await deniedAsk(kit, 'ios_build')
    expect(buildAsk.toolName).toContain('ios_build')
    expect(String(buildAsk.failure)).toContain('denied')

    const runAsk = await deniedAsk(kit, 'ios_run')
    expect(runAsk.toolName).toContain('ios_run')
    expect(String(runAsk.failure)).toContain('denied')
  })

  it('adds the ios rules for the configured app to every model request, and nothing when unconfigured', async () => {
    const options = {projectRoot: 'PayApp', bundleId: 'dev.conciv.pay', buildMode: 'swiftc'}
    const configured = await systemPromptsSent(options)
    const config = IosConfigSchema.parse(options)
    if (config === undefined) throw new Error('expected the ios options to configure the plugin')
    const rules = iosSystemPrompt(config, {cwd: configured.kit.stateRoot})
    expect(configured.system.filter((text) => text === rules)).toHaveLength(1)
    expect(rules).toContain(`Your working directory is ${configured.kit.stateRoot}`)

    const unconfigured = await systemPromptsSent()
    expect(unconfigured.system.filter((text) => text.includes('transparent WebView'))).toEqual([])
  })
})

describe('ios config', () => {
  function parseIosConfig(config: Record<string, unknown>) {
    return IosConfigSchema.safeParse({projectRoot: '/Users/dev/PayApp', bundleId: 'dev.conciv.pay', ...config})
  }

  function normalizedConcivUrl(concivUrl: string): string | undefined {
    const parsed = parseIosConfig({concivUrl})
    if (!parsed.success) throw new Error(`expected ${concivUrl} to be accepted`)
    return parsed.data?.concivUrl
  }

  function concivUrlRejection(concivUrl: string): string {
    const parsed = parseIosConfig({concivUrl})
    if (parsed.success) throw new Error(`expected ${concivUrl} to be rejected`)
    return parsed.error.issues.map((issue) => issue.message).join('\n')
  }

  it('reads no options as unconfigured, normalizes concivUrl to the api base and keeps extra source dirs', () => {
    expect(IosConfigSchema.parse({})).toBeUndefined()

    expect(normalizedConcivUrl('http://127.0.0.1:4599')).toBe('http://127.0.0.1:4599')
    expect(normalizedConcivUrl('http://127.0.0.1:4599/t/abc123')).toBe('http://127.0.0.1:4599/t/abc123')
    expect(normalizedConcivUrl('http://127.0.0.1:4599/native')).toBe('http://127.0.0.1:4599')
    expect(normalizedConcivUrl('http://127.0.0.1:4599/native/')).toBe('http://127.0.0.1:4599')
    expect(normalizedConcivUrl('http://127.0.0.1:4599/t/abc123/native')).toBe('http://127.0.0.1:4599/t/abc123')
    expect(concivUrlRejection('http://127.0.0.1:4599/native/x')).toContain('packages/plugins/ios/README.md')
    expect(concivUrlRejection('http://127.0.0.1:4599/panel')).toContain('appends /native itself')

    const parsed = parseIosConfig({buildMode: 'swiftc', extraSourceDirs: ['../ConcivWidget/Sources/ConcivWidget']})
    if (!parsed.success) throw new Error('expected the config to be accepted')
    expect(parsed.data?.extraSourceDirs).toEqual(['../ConcivWidget/Sources/ConcivWidget'])
  })
})

describe('the ios system prompt text', () => {
  const config: IosConfig = {
    projectRoot: 'apps/PayApp',
    bundleId: 'dev.conciv.pay',
    simulator: 'iPhone 17 Pro',
    buildMode: 'xcodebuild',
  }

  function prompt(overrides: Partial<IosConfig> = {}, cwd = '/Users/dev/pay'): string {
    return iosSystemPrompt({...config, ...overrides}, {cwd})
  }

  it('describes the native overlay, names the served app, rules out filesystem crawls and steers to the build loop', () => {
    const text = prompt()
    expect(text).not.toContain('build.sh')
    expect(text).toContain('ios_build')
    expect(text).toContain('/Users/dev/pay/apps/PayApp')
    expect(text).toContain('dev.conciv.pay')
    expect(text).toContain('iPhone 17 Pro')
    expect(text).toContain('Your working directory is /Users/dev/pay')
    expect(text).toContain('Never search from the filesystem root')
    expect(text).toContain('find /')
    expect(text).toContain('grep -rn "class PaymentCardCell" /Users/dev/pay/apps/PayApp')
    expect(text).toContain('the default scheme')
    expect(text).not.toContain('Extra Swift sources')
    expect(text).toContain('transparent WebView')
    expect(text).toContain('no hot reload')
    expect(prompt({projectRoot: '/opt/PayApp'})).toContain('the iOS project at /opt/PayApp,')
    expect(prompt({scheme: 'PayApp'})).toContain('scheme PayApp')
    expect(prompt({extraSourceDirs: ['../ConcivWidget/Sources']})).toContain('../ConcivWidget/Sources')
  })
})

describe('the real simctl runner', () => {
  async function pidWritten(directory: string, signal: AbortSignal): Promise<number> {
    for await (const change of watch(directory, {signal})) {
      if (change.filename === 'pid') return Number(await readFile(join(directory, 'pid'), 'utf8'))
    }
    throw new Error('the child never wrote its pid')
  }

  function alive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  it('stops the child process when the run is interrupted', async () => {
    const directory = tempDir('conciv-ios-child-')
    const script = [
      "const {renameSync, writeFileSync} = require('node:fs')",
      "const {join} = require('node:path')",
      'const directory = process.argv[1]',
      "writeFileSync(join(directory, 'pid.partial'), String(process.pid))",
      "renameSync(join(directory, 'pid.partial'), join(directory, 'pid'))",
      'setInterval(() => {}, 1 << 30)',
    ].join('\n')
    const watching = new AbortController()
    onTestFinished(() => watching.abort())
    const written = pidWritten(directory, watching.signal)
    const running = Effect.runFork(
      Effect.gen(function* () {
        const simctl = yield* Simctl.Service
        return yield* simctl.run(process.execPath, ['-e', script, directory])
      }).pipe(Effect.provide(Simctl.layer.pipe(Layer.provide(NodeChildProcessSpawner.layer), Layer.provide(platform)))),
    )
    const pid = await written
    expect(alive(pid)).toBe(true)
    await Effect.runPromise(Fiber.interrupt(running))
    expect(alive(pid)).toBe(false)
  })
})

describe('the ios tools against a fake simctl', () => {
  const transcriptsDir = fileURLToPath(new URL('./fixtures/transcripts/', import.meta.url))
  const transcript = (name: string): string => readFileSync(transcriptsDir + name, 'utf8')

  const PNG_RED_4x4_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='
  const BOOTED_UDID = 'CB0AA214-8029-4708-BB3A-1453676E70F9'

  type Call = {command: string; args: readonly string[]; options?: Simctl.RunOptions | undefined}
  type Reply = {code?: number; stdout?: Buffer | string; stderr?: string}
  type Script = {when: (call: Call) => boolean; reply: Reply}

  function toBuffer(value: Buffer | string | undefined): Buffer {
    if (value === undefined) return Buffer.alloc(0)
    return Buffer.isBuffer(value) ? value : Buffer.from(value)
  }

  function fakeSimctl(scripts: Script[]): {layer: Layer.Layer<Simctl.Interface>; calls: Call[]} {
    const calls: Call[] = []
    const layer = Layer.succeed(
      Simctl.Service,
      Simctl.Service.of({
        run: (command, args, options) =>
          Effect.sync(() => {
            const call: Call = {command, args, options}
            calls.push(call)
            const reply = scripts.find((script) => script.when(call))?.reply ?? {}
            return {code: reply.code ?? 0, stdout: toBuffer(reply.stdout), stderr: reply.stderr ?? ''}
          }),
      }),
    )
    return {layer, calls}
  }

  function against<Value, Failure>(
    layer: Layer.Layer<Simctl.Interface>,
    effect: Effect.Effect<Value, Failure, Simctl.Interface | FileSystem.FileSystem | Path.Path>,
  ): Promise<Value> {
    return Effect.runPromise(effect.pipe(Effect.provide(Layer.mergeAll(layer, platform))))
  }

  const has = (call: Call, token: string): boolean => call.args.includes(token)

  const build = Effect.runSync(makeBuild)

  function runtime(config: IosConfig, cwd: string, concivUrl?: string): IosRuntime {
    return {config, cwd, concivUrl: () => concivUrl}
  }

  function swiftcConfig(projectRoot: string, overrides: Partial<IosConfig> = {}): IosConfig {
    return {projectRoot, bundleId: 'dev.conciv.pay', simulator: 'iPhone 17 Pro', buildMode: 'swiftc', ...overrides}
  }

  function xcodebuildConfig(overrides: Partial<IosConfig> = {}): IosConfig {
    return {
      projectRoot: '/Users/dev/PayApp',
      scheme: 'PayApp',
      bundleId: 'dev.conciv.pay',
      simulator: 'iPhone 17 Pro',
      buildMode: 'xcodebuild',
      ...overrides,
    }
  }

  function tempSwiftProject(): string {
    const root = tempDir('conciv-ios-')
    mkdirSync(join(root, 'Sources'), {recursive: true})
    writeFileSync(join(root, 'Sources', 'Broken.swift'), 'let x: Int = "no"\n')
    writeFileSync(join(root, 'Info.plist'), '<plist></plist>')
    return root
  }

  function tempBuiltSwiftProject(): string {
    const root = tempSwiftProject()
    mkdirSync(join(root, 'build', 'pay.app'), {recursive: true})
    return root
  }

  const SDK: Script = {when: (call) => has(call, '--show-sdk-path'), reply: {stdout: '/sdk/iphonesimulator'}}
  const LISTED: Script = {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}}
  const LAUNCHED: Script = {when: (call) => has(call, 'launch'), reply: {stdout: 'dev.conciv.pay: 4210'}}

  async function failingSwiftcBuild(scripts: Script[]) {
    const root = tempSwiftProject()
    const {layer, calls} = fakeSimctl(scripts)
    const result = await against(layer, build(runtime(swiftcConfig(root), root), {}))
    expect(result.ok).toBe(false)
    expect(result.appPath).toBeNull()
    return {diagnostics: result.diagnostics, calls}
  }

  async function failedRun(config: IosConfig, cwd: string, scripts: Script[]) {
    const {layer, calls} = fakeSimctl(scripts)
    const result = await against(layer, run(runtime(config, cwd), {}))
    if (result.ok) throw new Error('expected a run failure')
    const failure: RunFailure = result
    return {failure, calls}
  }

  it('reports swiftc diagnostics, or the raw stderr when a failed compile has none', async () => {
    const parsed = await failingSwiftcBuild([
      SDK,
      {when: (call) => has(call, 'swiftc'), reply: {code: 1, stderr: transcript('swiftc-error.txt')}},
    ])
    const typeError = parsed.diagnostics.find((d) => d.message.includes("cannot convert value of type 'String'"))
    expect(typeError?.severity).toBe('error')
    expect(typeError?.line).toBe(2)
    expect(typeError?.file.endsWith('Broken.swift')).toBe(true)
    const compile = parsed.calls.find((call) => has(call, 'swiftc'))
    expect(compile?.args).toContain('-target')
    expect(compile?.args.some((arg) => arg.endsWith('Broken.swift'))).toBe(true)
    expect(compile?.options?.env?.DEVELOPER_DIR).toBe('/Applications/Xcode.app/Contents/Developer')

    const raw = await failingSwiftcBuild([
      SDK,
      {
        when: (call) => has(call, 'swiftc'),
        reply: {code: 1, stderr: "error: unable to load standard library for target 'arm64-apple-ios17.0-simulator'"},
      },
    ])
    expect(raw.diagnostics).toHaveLength(1)
    expect(raw.diagnostics[0]?.severity).toBe('error')
    expect(raw.diagnostics[0]?.message).toContain('unable to load standard library')
  })

  it('builds in swiftc mode with extra source roots into the assembled app, honoring developerDir', async () => {
    const parent = tempDir('conciv-ios-roots-')
    const twoRoots = join(parent, 'ConcivDemo')
    mkdirSync(join(twoRoots, 'Sources'), {recursive: true})
    writeFileSync(join(twoRoots, 'Sources', 'App.swift'), 'let app = 1\n')
    mkdirSync(join(twoRoots, 'Sources', 'Generated.swift'))
    writeFileSync(join(twoRoots, 'Info.plist'), '<plist></plist>')
    const extraSourceDir = join(parent, 'ConcivWidget', 'Sources', 'ConcivWidget')
    mkdirSync(extraSourceDir, {recursive: true})
    writeFileSync(join(extraSourceDir, 'Overlay.swift'), 'let overlay = 1\n')
    const extra = fakeSimctl([SDK])
    const config = swiftcConfig(twoRoots, {extraSourceDirs: ['../ConcivWidget/Sources/ConcivWidget']})
    expect((await against(extra.layer, build(runtime(config, twoRoots), {}))).ok).toBe(true)
    const twoRootCompile = extra.calls.find((call) => has(call, 'swiftc'))
    expect(twoRootCompile?.args).toContain(join(twoRoots, 'Sources', 'App.swift'))
    expect(twoRootCompile?.args).toContain(join(extraSourceDir, 'Overlay.swift'))
    expect(twoRootCompile?.args).not.toContain(join(twoRoots, 'Sources', 'Generated.swift'))

    const root = tempSwiftProject()
    const clean = fakeSimctl([SDK])
    const built = await against(clean.layer, build(runtime(swiftcConfig(root, {developerDir: '/opt/Xcode'}), root), {}))
    expect(built.ok).toBe(true)
    expect(built.appPath).toBe(join(root, 'build', 'pay.app'))
    expect(clean.calls.find((call) => has(call, 'swiftc'))?.options?.env?.DEVELOPER_DIR).toBe('/opt/Xcode')
  })

  it('builds in xcodebuild mode: diagnostics without an app path on failure, the settings app path on success', async () => {
    const failing = fakeSimctl([
      {when: (call) => has(call, 'build'), reply: {code: 1, stdout: transcript('xcodebuild-error.txt')}},
    ])
    const failed = await against(failing.layer, build(runtime(xcodebuildConfig(), '/tmp'), {}))
    expect(failed.ok).toBe(false)
    expect(failed.appPath).toBeNull()
    expect(failed.diagnostics.map((diagnostic) => diagnostic.severity)).toEqual(['error', 'warning'])
    expect(failing.calls.some((call) => has(call, '-showBuildSettings'))).toBe(false)

    const unparsed = fakeSimctl([
      {
        when: (call) => has(call, 'build'),
        reply: {
          code: 1,
          stderr:
            "xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory is a CLT instance",
        },
      },
    ])
    const raw = await against(unparsed.layer, build(runtime(xcodebuildConfig(), '/tmp'), {}))
    expect(raw.ok).toBe(false)
    expect(raw.diagnostics).toHaveLength(1)
    expect(raw.diagnostics[0]?.severity).toBe('error')
    expect(raw.diagnostics[0]?.message).toContain('requires Xcode')
    expect(unparsed.calls.some((call) => has(call, '-showBuildSettings'))).toBe(false)

    const passing = fakeSimctl([
      {when: (call) => has(call, '-showBuildSettings'), reply: {stdout: transcript('xcodebuild-settings.json')}},
    ])
    const passed = await against(passing.layer, build(runtime(xcodebuildConfig(), '/tmp'), {clean: true}))
    expect(passed.ok).toBe(true)
    expect(passed.appPath).toBe(
      '/Users/dev/Library/Developer/Xcode/DerivedData/PayApp/Build/Products/Debug-iphonesimulator/PayApp.app',
    )
    expect(passing.calls.find((call) => has(call, 'build'))?.args).toContain('clean')
  })

  it('reads the app path from xcodebuild settings by bundle id and app wrapper', () => {
    expect(parseXcodebuildAppPath(transcript('xcodebuild-settings.json'), 'dev.conciv.pay')).toBe(
      '/Users/dev/Library/Developer/Xcode/DerivedData/PayApp/Build/Products/Debug-iphonesimulator/PayApp.app',
    )
    const target = (wrapper: string, bundleId: string) => ({
      buildSettings: {TARGET_BUILD_DIR: '/d', WRAPPER_NAME: wrapper, PRODUCT_BUNDLE_IDENTIFIER: bundleId},
    })
    const second = JSON.stringify([
      target('PayAppTests.xctest', 'dev.conciv.pay.tests'),
      target('PayApp.app', 'dev.conciv.pay'),
    ])
    expect(parseXcodebuildAppPath(second, 'dev.conciv.pay')).toBe('/d/PayApp.app')
    expect(parseXcodebuildAppPath('not json', 'dev.conciv.pay')).toBeNull()
    expect(parseXcodebuildAppPath('{"buildSettings": {}}', 'dev.conciv.pay')).toBeNull()
    expect(parseXcodebuildAppPath('[]', 'dev.conciv.pay')).toBeNull()
    expect(
      parseXcodebuildAppPath('[{"buildSettings": {"TARGET_BUILD_DIR": "/only/dir"}}]', 'dev.conciv.pay'),
    ).toBeNull()
    expect(parseXcodebuildAppPath('[{}]', 'dev.conciv.pay')).toBeNull()
    expect(
      parseXcodebuildAppPath(JSON.stringify([target('PayKit.framework', 'dev.conciv.pay')]), 'dev.conciv.pay'),
    ).toBeNull()
  })

  it('runs the app: boot, install, terminate and launch on the booted udid, with the conciv url and autoshow env', async () => {
    const root = tempBuiltSwiftProject()
    const launched = fakeSimctl([LISTED, LAUNCHED])
    const result = await against(
      launched.layer,
      run(runtime(swiftcConfig(root), root, 'http://127.0.0.1:8891'), {autoshow: true}),
    )
    expect(result).toEqual({ok: true, udid: BOOTED_UDID, bundleId: 'dev.conciv.pay', pid: 4210})
    for (const step of ['boot', 'install', 'terminate'])
      expect(
        launched.calls.some((call) => has(call, step) && has(call, BOOTED_UDID)),
        step,
      ).toBe(true)
    const launch = launched.calls.find((call) => has(call, 'launch'))
    expect(launch?.options?.env?.SIMCTL_CHILD_CONCIV_URL).toBe('http://127.0.0.1:8891')
    expect(launch?.options?.env?.SIMCTL_CHILD_CONCIV_AUTOSHOW).toBe('1')

    const launchEnv = async (config: IosConfig, concivUrl: string | undefined) => {
      const {layer, calls} = fakeSimctl([LISTED, LAUNCHED])
      await against(layer, run(runtime(config, root, concivUrl), {}))
      return calls.find((call) => has(call, 'launch'))?.options?.env
    }
    const plain = await launchEnv(swiftcConfig(root), 'http://127.0.0.1:8891')
    expect(plain?.SIMCTL_CHILD_CONCIV_URL).toBe('http://127.0.0.1:8891')
    expect(plain?.SIMCTL_CHILD_CONCIV_AUTOSHOW).toBeUndefined()
    const overridden = await launchEnv(
      swiftcConfig(root, {concivUrl: 'http://127.0.0.1:4599'}),
      'http://127.0.0.1:8891',
    )
    expect(overridden?.SIMCTL_CHILD_CONCIV_URL).toBe('http://127.0.0.1:4599')
    expect((await launchEnv(swiftcConfig(root), undefined))?.SIMCTL_CHILD_CONCIV_URL).toBeUndefined()
  })

  it('checks every packaging step of a swiftc build', async () => {
    const plutil = await failingSwiftcBuild([
      SDK,
      {when: (call) => call.command === 'plutil', reply: {code: 1, stderr: 'plutil: Info.plist is not a valid plist'}},
    ])
    expect(plutil.diagnostics).toHaveLength(1)
    expect(plutil.diagnostics[0]?.message).toContain('is not a valid plist')
    expect(plutil.calls.some((call) => call.command === 'codesign')).toBe(false)

    const codesign = await failingSwiftcBuild([
      SDK,
      {when: (call) => call.command === 'codesign', reply: {code: 1, stderr: 'codesign: bundle format unrecognized'}},
    ])
    expect(codesign.diagnostics).toHaveLength(1)
    expect(codesign.diagnostics[0]?.severity).toBe('error')
    expect(codesign.diagnostics[0]?.message).toContain('bundle format unrecognized')

    const root = tempDir('conciv-ios-')
    mkdirSync(join(root, 'Sources'), {recursive: true})
    writeFileSync(join(root, 'Sources', 'App.swift'), 'let value = 1\n')
    const {layer, calls} = fakeSimctl([SDK])
    const result = await against(layer, build(runtime(swiftcConfig(root), root), {}))
    expect(result.ok).toBe(false)
    expect(result.appPath).toBeNull()
    expect(result.diagnostics.some((d) => d.message.includes('Info.plist not found'))).toBe(true)
    expect(calls.some((call) => call.command === 'plutil' || call.command === 'codesign')).toBe(false)
  })

  it('picks the available simulator among duplicate names', async () => {
    const root = tempBuiltSwiftProject()
    const devices = {
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
          {udid: 'UNAVAILABLE-UDID', name: 'iPhone 17 Pro', state: 'Shutdown', isAvailable: false},
        ],
        'com.apple.CoreSimulator.SimRuntime.iOS-26-5': [
          {udid: 'GOOD-UDID', name: 'iPhone 17 Pro', state: 'Shutdown', isAvailable: true},
        ],
      },
    }
    const {layer, calls} = fakeSimctl([
      {when: (call) => has(call, 'list'), reply: {stdout: JSON.stringify(devices)}},
      LAUNCHED,
    ])
    const result = await against(layer, run(runtime(swiftcConfig(root), root), {}))
    expect(result.udid).toBe('GOOD-UDID')
    expect(calls.some((call) => has(call, 'install') && has(call, 'GOOD-UDID'))).toBe(true)
  })

  it('names the stage a run stopped at', async () => {
    const unbuilt = tempSwiftProject()
    const noSimulator = await failedRun(swiftcConfig(unbuilt), unbuilt, [
      {when: (call) => has(call, 'list'), reply: {stdout: JSON.stringify({devices: {}})}},
    ])
    expect(noSimulator.failure.stage).toBe('resolve-simulator')
    expect(noSimulator.failure.error).toContain('iPhone 17 Pro')

    const booting = await failedRun(swiftcConfig(unbuilt), unbuilt, [
      LISTED,
      {when: (call) => has(call, 'bootstatus'), reply: {code: 1, stderr: 'Unable to boot device in current state'}},
    ])
    expect(booting.failure.stage).toBe('boot')
    expect(booting.failure.error).toContain('Unable to boot device')

    const noSettings = await failedRun(xcodebuildConfig(), '/tmp', [
      LISTED,
      {when: (call) => has(call, '-showBuildSettings'), reply: {code: 1, stderr: 'no build settings'}},
    ])
    expect(noSettings.failure.stage).toBe('artifact')
    expect(noSettings.failure.error).toContain('ios_build')

    const neverBuilt = await failedRun(swiftcConfig(unbuilt), unbuilt, [LISTED])
    expect(neverBuilt.failure.stage).toBe('artifact')
    expect(neverBuilt.failure.error).toContain(join(unbuilt, 'build', 'pay.app'))
    expect(neverBuilt.failure.error).toContain('swiftc')
    expect(neverBuilt.failure.error).toContain('ios_build')
    expect(neverBuilt.calls.some((call) => has(call, 'install'))).toBe(false)

    const built = tempBuiltSwiftProject()
    const install = await failedRun(swiftcConfig(built), built, [
      LISTED,
      {when: (call) => has(call, 'install'), reply: {code: 1, stderr: 'Failed to install the requested application'}},
    ])
    expect(install.failure.stage).toBe('install')
    expect(install.failure.error).toContain('Failed to install')
    expect(install.calls.some((call) => has(call, 'terminate') || has(call, 'launch'))).toBe(false)

    const launch = await failedRun(swiftcConfig(built), built, [
      LISTED,
      {when: (call) => has(call, 'launch'), reply: {code: 1, stderr: 'The request to launch was denied'}},
    ])
    expect(launch.failure.stage).toBe('launch')
    expect(launch.failure.error).toContain('launch was denied')
  })

  it('captures the screen as a png data uri with its size', async () => {
    const {layer} = fakeSimctl([
      LISTED,
      {when: (call) => has(call, 'screenshot'), reply: {stdout: Buffer.from(PNG_RED_4x4_BASE64, 'base64')}},
    ])
    expect(await against(layer, screenshot(runtime(swiftcConfig('/tmp'), '/tmp')))).toEqual({
      output: {ok: true, width: 4, height: 4},
      content: [{type: 'file', uri: `data:image/png;base64,${PNG_RED_4x4_BASE64}`, mime: 'image/png'}],
    })
  })

  it('runs one build at a time: a second build starts its first command only after the first build finishes', async () => {
    const firstBuildReleased = Effect.runSync(Deferred.make<void>())
    const started: string[] = []
    const gated = Layer.succeed(
      Simctl.Service,
      Simctl.Service.of({
        run: (_command, args) =>
          Effect.gen(function* () {
            const scheme = args[args.indexOf('-scheme') + 1] ?? ''
            started.push(`${scheme} ${args.includes('-showBuildSettings') ? 'settings' : 'build'}`)
            if (scheme === 'First' && args.includes('build')) yield* Deferred.await(firstBuildReleased)
            return {code: 0, stdout: new Uint8Array(), stderr: ''}
          }),
      }),
    )
    const serialBuild = Effect.runSync(makeBuild)
    await against(
      gated,
      Effect.gen(function* () {
        const first = yield* Effect.forkChild(serialBuild(runtime(xcodebuildConfig({scheme: 'First'}), '/tmp'), {}), {
          startImmediately: true,
        })
        const second = yield* Effect.forkChild(serialBuild(runtime(xcodebuildConfig({scheme: 'Second'}), '/tmp'), {}), {
          startImmediately: true,
        })
        expect(started).toEqual(['First build'])
        yield* Deferred.succeed(firstBuildReleased, undefined)
        yield* Fiber.join(first)
        yield* Fiber.join(second)
      }),
    )
    expect(started).toEqual(['First build', 'First settings', 'Second build', 'Second settings'])
  })

  it('reads recent log lines with a window and a limit, and reports a missing simulator or a bad predicate', async () => {
    const shown = fakeSimctl([LISTED, {when: (call) => has(call, 'show'), reply: {stdout: transcript('log-show.txt')}}])
    const all = await against(shown.layer, logs(runtime(swiftcConfig('/tmp'), '/tmp'), {sinceSeconds: 120}))
    if (!all.ok) throw new Error('expected log lines')
    expect(all.lines).toHaveLength(3)
    expect(all.lines[1]).toContain('CONCIV_URL=')
    expect(shown.calls.find((call) => has(call, 'show'))?.args).toContain('120s')
    expect(await against(shown.layer, logs(runtime(swiftcConfig('/tmp'), '/tmp'), {limit: 1}))).toEqual({
      ok: true,
      lines: ['2026-07-24 10:15:03.010 PayApp[4210:99] overlay attached'],
    })

    const empty = fakeSimctl([{when: (call) => has(call, 'list'), reply: {stdout: JSON.stringify({devices: {}})}}])
    const missing = await against(empty.layer, logs(runtime(swiftcConfig('/tmp'), '/tmp'), {}))
    expect(missing).toMatchObject({ok: false, lines: []})
    if (missing.ok) throw new Error('expected a logs failure')
    expect(missing.error).toContain('ios_logs')

    const invalid = fakeSimctl([
      LISTED,
      {when: (call) => has(call, 'show'), reply: {code: 1, stderr: 'log: Invalid predicate: unknown identifier "bad"'}},
    ])
    const rejected = await against(invalid.layer, logs(runtime(swiftcConfig('/tmp'), '/tmp'), {predicate: 'bad'}))
    if (rejected.ok) throw new Error('expected a logs failure')
    expect(rejected.lines).toEqual([])
    expect(rejected.error).toContain('Invalid predicate')
  })
})

const bridgeMessageSchemasByType = {
  'bridge.ready': BridgeReadySchema,
  'handshake.hello': HandshakeHelloSchema,
  'grab.pick': GrabPickSchema,
  'grab.cancel': GrabCancelSchema,
  'bridge.ack': BridgeAckSchema,
  'host.panelToggled': HostPanelToggledSchema,
  'host.log': HostLogSchema,
  handshake: HandshakeSchema,
  'bridge.incompatible': BridgeIncompatibleSchema,
  open: OpenSchema,
  close: CloseSchema,
  grabResult: GrabResultSchema,
  grabCapability: GrabCapabilitySchema,
}

describe('bridge conformance', () => {
  const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'bridge')

  type Fixture = {file: string; data: {type?: unknown}}

  function readFixtures(dir: string): Fixture[] {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => ({file: name, data: JSON.parse(readFileSync(join(dir, name), 'utf8'))}))
  }

  function byType(fixtures: Fixture[]): Record<string, Fixture> {
    return keyBy(
      fixtures.filter((fixture) => typeof fixture.data.type === 'string'),
      (fixture) => String(fixture.data.type),
    )
  }

  const validFixtures = readFixtures(fixturesDir)
  const invalidFixtures = readFixtures(join(fixturesDir, 'invalid'))
  const unknownKeyFixtures = readFixtures(join(fixturesDir, 'unknown-key'))

  const validByType = byType(validFixtures)
  const invalidByType = byType(invalidFixtures)
  const unknownKeyByType = byType(unknownKeyFixtures)

  const unionTypes = BridgeMessageSchema.options.map((option) => option.shape.type.value)

  function isKnownMessageType(type: string): type is keyof typeof bridgeMessageSchemasByType {
    return Object.hasOwn(bridgeMessageSchemasByType, type)
  }

  function strictSchemaFor(type: string) {
    if (!isKnownMessageType(type)) throw new Error(`no schema registered for ${type}`)
    return bridgeMessageSchemasByType[type].strict()
  }

  describe('bridge message union exhaustiveness', () => {
    it('covers every catalog message', () => {
      expect(unionTypes.length).toBe(13)
    })

    it.each(unionTypes)('%s has valid, invalid, and unknown-key fixtures', (type) => {
      expect(Object.hasOwn(validByType, type), `missing valid fixture for ${type}`).toBe(true)
      expect(Object.hasOwn(invalidByType, type), `missing invalid fixture for ${type}`).toBe(true)
      expect(Object.hasOwn(unknownKeyByType, type), `missing unknown-key fixture for ${type}`).toBe(true)
    })

    it('every fixture type is a known union member', () => {
      for (const fixture of [...validFixtures, ...invalidFixtures, ...unknownKeyFixtures]) {
        expect(unionTypes).toContain(fixture.data.type)
      }
    })
  })

  describe('runtime parsing (non-strict) ignores unknown keys', () => {
    it.each(validFixtures)('valid fixture $file parses', (fixture) => {
      expect(BridgeMessageSchema.safeParse(fixture.data).success).toBe(true)
    })

    it.each(unknownKeyFixtures)('unknown-key fixture $file parses and drops the extra key', (fixture) => {
      const result = BridgeMessageSchema.safeParse(fixture.data)
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(JSON.stringify(result.data).length).toBeLessThan(JSON.stringify(fixture.data).length)
    })
  })

  describe('invalid fixtures are structurally wrong', () => {
    it.each(invalidFixtures)('invalid fixture $file fails runtime and strict parse', (fixture) => {
      expect(BridgeMessageSchema.safeParse(fixture.data).success).toBe(false)
      const type = fixture.data.type
      expect(typeof type).toBe('string')
      if (typeof type !== 'string') return
      expect(strictSchemaFor(type).safeParse(fixture.data).success).toBe(false)
    })
  })

  describe('strict variant flags unknown keys that runtime ignores', () => {
    it.each(unknownKeyFixtures)('unknown-key fixture $file fails strict parse', (fixture) => {
      const type = fixture.data.type
      expect(typeof type).toBe('string')
      if (typeof type !== 'string') return
      expect(strictSchemaFor(type).safeParse(fixture.data).success).toBe(false)
    })
  })

  describe('decode-equivalence and roundtrip', () => {
    it.each(validFixtures)('valid fixture $file survives decode -> encode -> decode', (fixture) => {
      const decoded = BridgeMessageSchema.parse(fixture.data)
      const reDecoded = BridgeMessageSchema.parse(JSON.parse(JSON.stringify(decoded)))
      expect(reDecoded).toEqual(decoded)
    })
  })

  describe('committed JSON matches the fixture table', () => {
    it.each(bridgeFixtures)('$file JSON on disk equals the authored table entry', (fixture) => {
      const valid = JSON.parse(readFileSync(join(fixturesDir, `${fixture.file}.json`), 'utf8'))
      const invalid = JSON.parse(readFileSync(join(fixturesDir, 'invalid', `${fixture.file}.json`), 'utf8'))
      const unknownKey = JSON.parse(readFileSync(join(fixturesDir, 'unknown-key', `${fixture.file}.json`), 'utf8'))
      expect(valid).toEqual(fixture.valid)
      expect(invalid).toEqual(fixture.invalid)
      expect(unknownKey).toEqual(fixture.unknownKey)
    })
  })

  describe('native encode direction covers every nil-optional combination', () => {
    it.each(nativeEncodeFixtures)('$file committed JSON equals the authored payload', (fixture) => {
      const onDisk = JSON.parse(readFileSync(join(fixturesDir, 'encode', `${fixture.file}.json`), 'utf8'))
      expect(onDisk).toEqual(fixture.json)
    })

    it.each(nativeEncodeFixtures)('$file payload validates against NativeToPageSchema', (fixture) => {
      expect(NativeToPageSchema.safeParse(fixture.json).success).toBe(true)
    })

    it('a handshake with no token key still parses and yields token null', () => {
      const tokenless = nativeEncodeFixtures.find((fixture) => fixture.file === 'n2p.encode.handshake-tokenless')
      if (tokenless === undefined) throw new Error('missing tokenless handshake encode fixture')
      expect(Object.hasOwn(tokenless.json, 'token')).toBe(false)
      const result = NativeToPageSchema.safeParse(tokenless.json)
      expect(result.success).toBe(true)
      if (!result.success) return
      if (result.data.type !== 'handshake') throw new Error('expected handshake')
      expect(result.data.token).toBeNull()
    })
  })

  describe('tolerates the swift encoder omitting nil optional keys', () => {
    const preview = {kind: 'image', dataUrl: 'data:image/jpeg;base64,AA==', width: 10, height: 10}

    it('normalizes absent grab keys to null on a successful pick', () => {
      const result = NativeToPageSchema.safeParse({
        v: 1,
        seq: 5,
        type: 'grabResult',
        requestId: 'req-1',
        grab: {
          text: 'Payroll Deposit',
          preview,
          source: {componentName: 'UILabel', filePath: ''},
          subtree: {class: 'UILabel', rect: {x: 0, y: 0, width: 10, height: 10}, children: []},
        },
      })
      expect(result.success).toBe(true)
      if (!result.success) return
      if (result.data.type !== 'grabResult' || result.data.grab === null) throw new Error('expected a grab')
      expect(result.data.grab.rect).toBeNull()
      expect(result.data.grab.source).toEqual({componentName: 'UILabel', filePath: '', lineNumber: null})
      expect(result.data.grab.subtree).toEqual({
        class: 'UILabel',
        a11yId: null,
        text: null,
        rect: {x: 0, y: 0, width: 10, height: 10},
        children: [],
      })
    })

    it('accepts a grabResult with no grab key and yields null', () => {
      const result = NativeToPageSchema.safeParse({v: 1, seq: 5, type: 'grabResult', requestId: 'req-1'})
      expect(result.success).toBe(true)
      if (!result.success) return
      if (result.data.type !== 'grabResult') throw new Error('expected grabResult')
      expect(result.data.grab).toBeNull()
    })
  })

  describe('the bounded subtree is enforced at the protocol boundary', () => {
    const rect = {x: 0, y: 0, width: 1, height: 1}
    const preview = {kind: 'image', dataUrl: 'data:image/jpeg;base64,AA==', width: 1, height: 1}
    const node = (children: unknown[]): Record<string, unknown> => ({
      class: 'N',
      a11yId: null,
      text: null,
      rect,
      children,
    })
    const chain = (levels: number): Record<string, unknown> => {
      let current = node([])
      for (let index = 0; index < levels; index += 1) current = node([current])
      return current
    }
    const grabResult = (subtree: unknown) => ({
      v: 1,
      seq: 5,
      type: 'grabResult',
      requestId: 'req-1',
      grab: {text: 'x', preview, subtree},
    })

    it('accepts a subtree at the depth limit', () => {
      expect(NativeToPageSchema.safeParse(grabResult(chain(SUBTREE_MAX_DEPTH))).success).toBe(true)
    })

    it('rejects a subtree deeper than the depth limit', () => {
      expect(NativeToPageSchema.safeParse(grabResult(chain(SUBTREE_MAX_DEPTH + 2))).success).toBe(false)
    })

    it('rejects a subtree whose node count exceeds the wire budget', () => {
      const wide = node(Array.from({length: SUBTREE_MAX_NODES + 1}, () => node([])))
      expect(NativeToPageSchema.safeParse(grabResult(wide)).success).toBe(false)
    })
  })

  describe('NeutralGrab reuses the @conciv/grab contract', () => {
    it('is assignable to Grab with an image preview', () => {
      const asGrab = (grab: NeutralGrabAsGrab): Grab => grab
      expect(typeof asGrab).toBe('function')
    })
  })
})

describe('page base', () => {
  describe('nativePageBase', () => {
    it('returns the bare origin when the page has no token prefix', () => {
      expect(nativePageBase({origin: 'http://127.0.0.1:4599', pathname: '/native'})).toBe('http://127.0.0.1:4599')
    })

    it('keeps the /t/<token> prefix when the page is token-scoped', () => {
      expect(nativePageBase({origin: 'http://127.0.0.1:4599', pathname: '/t/tok-abc/native'})).toBe(
        'http://127.0.0.1:4599/t/tok-abc',
      )
    })

    it('tolerates a trailing slash on the native route', () => {
      expect(nativePageBase({origin: 'http://host', pathname: '/t/tok/native/'})).toBe('http://host/t/tok')
    })

    it('falls back to the origin when the path is not the native route', () => {
      expect(nativePageBase({origin: 'http://host', pathname: '/'})).toBe('http://host')
    })
  })
})
