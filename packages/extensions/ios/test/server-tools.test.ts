import {mkdtempSync, mkdirSync, writeFileSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import type {ContentPart} from '@conciv/extension'
import {
  parseXcodebuildAppPath,
  runBuild,
  runLogs,
  runRun,
  runScreenshot,
  type IosToolContext,
} from '../src/server/tools.js'
import type {IosConfig} from '../src/shared/meta.js'
import type {RunOptions, RunResult, SimctlRunner} from '../src/server/simctl-runner.js'

const transcriptsDir = fileURLToPath(new URL('./fixtures/transcripts/', import.meta.url))
const transcript = (name: string): string => readFileSync(transcriptsDir + name, 'utf8')

const PNG_RED_4x4_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg=='

type Call = {cmd: string; args: string[]; opts?: RunOptions}
type Reply = {code?: number; stdout?: Buffer | string; stderr?: string}
type Script = {when: (call: Call) => boolean; reply: Reply}

function toBuffer(value: Buffer | string | undefined): Buffer {
  if (value === undefined) return Buffer.alloc(0)
  return Buffer.isBuffer(value) ? value : Buffer.from(value)
}

function fakeRunner(scripts: Script[]): {runner: SimctlRunner; calls: Call[]} {
  const calls: Call[] = []
  const runner: SimctlRunner = {
    run: (cmd, args, opts) => {
      const call: Call = {cmd, args, opts}
      calls.push(call)
      const match = scripts.find((script) => script.when(call))
      const reply = match?.reply ?? {}
      const result: RunResult = {code: reply.code ?? 0, stdout: toBuffer(reply.stdout), stderr: reply.stderr ?? ''}
      return Promise.resolve(result)
    },
  }
  return {runner, calls}
}

const has = (call: Call, token: string): boolean => call.args.includes(token)

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
  const root = mkdtempSync(join(tmpdir(), 'conciv-ios-'))
  mkdirSync(join(root, 'Sources'), {recursive: true})
  writeFileSync(join(root, 'Sources', 'Broken.swift'), 'let x: Int = "no"\n')
  writeFileSync(join(root, 'Info.plist'), '<plist></plist>')
  return root
}

describe('ios tools when the extension is not configured', () => {
  const ctx: IosToolContext = {config: undefined, runner: fakeRunner([]).runner, cwd: '/tmp'}

  it('every tool returns a clear not-configured result instead of throwing', async () => {
    expect(await runBuild(ctx, {})).toEqual({ok: false, error: 'ios extension not configured'})
    expect(await runRun(ctx, {})).toEqual({ok: false, error: 'ios extension not configured'})
    expect(await runScreenshot(ctx)).toEqual({ok: false, error: 'ios extension not configured'})
    expect(await runLogs(ctx, {})).toEqual({ok: false, error: 'ios extension not configured'})
  })
})

describe('ios.build swiftc mode', () => {
  it('parses a real swiftc error transcript into diagnostics and reports failure', async () => {
    const root = tempSwiftProject()
    const {runner, calls} = fakeRunner([
      {when: (call) => has(call, '--show-sdk-path'), reply: {stdout: '/sdk/iphonesimulator'}},
      {when: (call) => has(call, 'swiftc'), reply: {code: 1, stderr: transcript('swiftc-error.txt')}},
    ])
    const result = await runBuild({config: swiftcConfig(root), runner, cwd: root}, {})
    if ('error' in result) throw new Error('unexpected not-configured')
    expect(result.ok).toBe(false)
    expect(result.appPath).toBeNull()
    const typeError = result.diagnostics.find((d) => d.message.includes("cannot convert value of type 'String'"))
    expect(typeError?.severity).toBe('error')
    expect(typeError?.line).toBe(2)
    expect(typeError?.file.endsWith('Broken.swift')).toBe(true)
    const compile = calls.find((call) => has(call, 'swiftc'))
    expect(compile?.args).toContain('-target')
    expect(compile?.args.some((arg) => arg.endsWith('Broken.swift'))).toBe(true)
    expect(compile?.opts?.env?.DEVELOPER_DIR).toBe('/Applications/Xcode.app/Contents/Developer')
  })

  it('returns ok and the assembled .app path on a clean compile, honoring developerDir override', async () => {
    const root = tempSwiftProject()
    const {runner, calls} = fakeRunner([
      {when: (call) => has(call, '--show-sdk-path'), reply: {stdout: '/sdk/iphonesimulator'}},
    ])
    const result = await runBuild({config: swiftcConfig(root, {developerDir: '/opt/Xcode'}), runner, cwd: root}, {})
    if ('error' in result) throw new Error('unexpected not-configured')
    expect(result.ok).toBe(true)
    expect(result.appPath).toBe(join(root, 'build', 'pay.app'))
    const compile = calls.find((call) => has(call, 'swiftc'))
    expect(compile?.opts?.env?.DEVELOPER_DIR).toBe('/opt/Xcode')
  })
})

describe('ios.build xcodebuild mode', () => {
  it('parses xcodebuild diagnostics and does not resolve an app path on failure', async () => {
    const {runner, calls} = fakeRunner([
      {when: (call) => has(call, 'build'), reply: {code: 1, stdout: transcript('xcodebuild-error.txt')}},
    ])
    const result = await runBuild({config: xcodebuildConfig(), runner, cwd: '/tmp'}, {})
    if ('error' in result) throw new Error('unexpected not-configured')
    expect(result.ok).toBe(false)
    expect(result.appPath).toBeNull()
    expect(result.diagnostics.map((d) => d.severity)).toEqual(['error', 'warning'])
    expect(calls.some((call) => has(call, '-showBuildSettings'))).toBe(false)
  })

  it('resolves the app path from build settings on success', async () => {
    const {runner} = fakeRunner([
      {when: (call) => has(call, '-showBuildSettings'), reply: {stdout: transcript('xcodebuild-settings.json')}},
    ])
    const result = await runBuild({config: xcodebuildConfig(), runner, cwd: '/tmp'}, {clean: true})
    if ('error' in result) throw new Error('unexpected not-configured')
    expect(result.ok).toBe(true)
    expect(result.appPath).toBe(
      '/Users/dev/Library/Developer/Xcode/DerivedData/PayApp/Build/Products/Debug-iphonesimulator/PayApp.app',
    )
  })
})

describe('parseXcodebuildAppPath', () => {
  it('joins TARGET_BUILD_DIR and WRAPPER_NAME from real build settings', () => {
    expect(parseXcodebuildAppPath(transcript('xcodebuild-settings.json'))).toBe(
      '/Users/dev/Library/Developer/Xcode/DerivedData/PayApp/Build/Products/Debug-iphonesimulator/PayApp.app',
    )
  })

  it('returns null for invalid json, a non-array, an empty array, or missing settings', () => {
    expect(parseXcodebuildAppPath('not json')).toBeNull()
    expect(parseXcodebuildAppPath('{"buildSettings": {}}')).toBeNull()
    expect(parseXcodebuildAppPath('[]')).toBeNull()
    expect(parseXcodebuildAppPath('[{"buildSettings": {"TARGET_BUILD_DIR": "/only/dir"}}]')).toBeNull()
    expect(parseXcodebuildAppPath('[{}]')).toBeNull()
  })
})

function launchScenario(): {root: string; runner: SimctlRunner; calls: Call[]} {
  const root = tempSwiftProject()
  const {runner, calls} = fakeRunner([
    {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
    {when: (call) => has(call, 'launch'), reply: {stdout: 'dev.conciv.pay: 4210'}},
  ])
  return {root, runner, calls}
}

describe('ios.run', () => {
  it('resolves the booted udid, drives boot/install/terminate/launch, and passes SIMCTL_CHILD env', async () => {
    const {root, runner, calls} = launchScenario()
    const result = await runRun(
      {config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => 'http://127.0.0.1:8891/native'},
      {autoshow: true},
    )
    if ('error' in result) throw new Error('unexpected not-configured')
    expect(result).toEqual({
      ok: true,
      udid: 'CB0AA214-8029-4708-BB3A-1453676E70F9',
      bundleId: 'dev.conciv.pay',
      pid: 4210,
    })
    const udid = 'CB0AA214-8029-4708-BB3A-1453676E70F9'
    expect(calls.some((call) => has(call, 'boot') && has(call, udid))).toBe(true)
    expect(calls.some((call) => has(call, 'install') && has(call, udid))).toBe(true)
    expect(calls.some((call) => has(call, 'terminate') && has(call, udid))).toBe(true)
    const launch = calls.find((call) => has(call, 'launch'))
    expect(launch?.opts?.env?.SIMCTL_CHILD_CONCIV_URL).toBe('http://127.0.0.1:8891/native')
    expect(launch?.opts?.env?.SIMCTL_CHILD_CONCIV_AUTOSHOW).toBe('1')
  })

  it('prefers an explicit config concivUrl override over the core native url', async () => {
    const {root, runner, calls} = launchScenario()
    await runRun(
      {
        config: swiftcConfig(root, {concivUrl: 'http://127.0.0.1:4599/native'}),
        runner,
        cwd: root,
        nativeUrl: () => 'http://127.0.0.1:8891/native',
      },
      {},
    )
    const launch = calls.find((call) => has(call, 'launch'))
    expect(launch?.opts?.env?.SIMCTL_CHILD_CONCIV_URL).toBe('http://127.0.0.1:4599/native')
  })

  it('omits the conciv url env when neither a config override nor a core native url resolves', async () => {
    const {root, runner, calls} = launchScenario()
    await runRun({config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => undefined}, {})
    const launch = calls.find((call) => has(call, 'launch'))
    expect(launch?.opts?.env?.SIMCTL_CHILD_CONCIV_URL).toBeUndefined()
  })

  it('omits the autoshow env when not requested', async () => {
    const {root, runner, calls} = launchScenario()
    await runRun({config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => 'http://core'}, {})
    const launch = calls.find((call) => has(call, 'launch'))
    expect(launch?.opts?.env?.SIMCTL_CHILD_CONCIV_AUTOSHOW).toBeUndefined()
  })
})

describe('ios.screenshot', () => {
  it('returns an imageResult with png dimensions parsed from the byte stream', async () => {
    const png = Buffer.from(PNG_RED_4x4_BASE64, 'base64')
    const {runner} = fakeRunner([
      {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
      {when: (call) => has(call, 'screenshot'), reply: {stdout: png}},
    ])
    const result = (await runScreenshot({config: swiftcConfig('/tmp'), runner, cwd: '/tmp'})) as ContentPart[]
    expect(result).toEqual([
      {type: 'image', source: {type: 'data', value: PNG_RED_4x4_BASE64, mimeType: 'image/png'}},
      {type: 'text', content: JSON.stringify({width: 4, height: 4})},
    ])
  })
})

describe('ios.logs', () => {
  it('returns recent lines and honors the limit', async () => {
    const {runner, calls} = fakeRunner([
      {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
      {when: (call) => has(call, 'show'), reply: {stdout: transcript('log-show.txt')}},
    ])
    const all = await runLogs({config: swiftcConfig('/tmp'), runner, cwd: '/tmp'}, {sinceSeconds: 120})
    if ('error' in all) throw new Error('unexpected not-configured')
    expect(all.ok).toBe(true)
    expect(all.lines).toHaveLength(3)
    expect(all.lines[1]).toContain('CONCIV_URL=')
    const logShow = calls.find((call) => has(call, 'show'))
    expect(logShow?.args).toContain('120s')

    const limited = await runLogs({config: swiftcConfig('/tmp'), runner, cwd: '/tmp'}, {limit: 1})
    if ('error' in limited) throw new Error('unexpected not-configured')
    expect(limited.lines).toEqual(['2026-07-24 10:15:03.010 PayApp[4210:99] overlay attached'])
  })
})
