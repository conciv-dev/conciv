import {mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import type {Grab} from '@conciv/grab'
import {makeRunTypescript} from '@conciv/harness-testkit'
import {start, type Engine} from '@conciv/core'
import type {AnyExtension} from '@conciv/extension'
import {
  BridgeMessageSchema,
  bridgeMessageSchemasByType,
  NativeToPageSchema,
  type NeutralGrabAsGrab,
  SUBTREE_MAX_DEPTH,
  SUBTREE_MAX_NODES,
} from '../src/shared/bridge.js'
import {bridgeFixtures, nativeEncodeFixtures} from '../fixtures/bridge/bridge.fixtures.js'
import {IosConfigSchema, type IosConfig} from '../src/shared/meta.js'
import {nativePageBase} from '../src/shared/page-base.js'
import {iosSystemPrompt} from '../src/server/prompt.js'
import {
  parseXcodebuildAppPath,
  runBuild,
  runLogs,
  runRun,
  runScreenshot,
  type IosToolContext,
  type LogsFailure,
  type RunFailure,
} from '../src/server/tools.js'
import type {RunOptions, RunResult, SimctlRunner} from '../src/server/simctl-runner.js'
import iosExtension from '../src/server.js'

describe('bridge conformance', () => {
  const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'bridge')

  type Fixture = {file: string; data: {type?: unknown}}

  function readFixtures(dir: string): Fixture[] {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => ({file: name, data: JSON.parse(readFileSync(join(dir, name), 'utf8'))}))
  }

  function byType(fixtures: Fixture[]): Map<string, Fixture> {
    const map = new Map<string, Fixture>()
    for (const fixture of fixtures) {
      const type = fixture.data.type
      if (typeof type === 'string') map.set(type, fixture)
    }
    return map
  }

  const validFixtures = readFixtures(fixturesDir)
  const invalidFixtures = readFixtures(join(fixturesDir, 'invalid'))
  const unknownKeyFixtures = readFixtures(join(fixturesDir, 'unknown-key'))

  const validByType = byType(validFixtures)
  const invalidByType = byType(invalidFixtures)
  const unknownKeyByType = byType(unknownKeyFixtures)

  const unionTypes = BridgeMessageSchema.options.map((option) => option.shape.type.value)

  function isKnownMessageType(type: string): type is keyof typeof bridgeMessageSchemasByType {
    return type in bridgeMessageSchemasByType
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
      expect(validByType.has(type), `missing valid fixture for ${type}`).toBe(true)
      expect(invalidByType.has(type), `missing invalid fixture for ${type}`).toBe(true)
      expect(unknownKeyByType.has(type), `missing unknown-key fixture for ${type}`).toBe(true)
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
      expect('token' in tokenless.json).toBe(false)
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

describe('meta schema', () => {
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

  describe('ios config concivUrl', () => {
    it('keeps a bare api base unchanged', () => {
      expect(normalizedConcivUrl('http://127.0.0.1:4599')).toBe('http://127.0.0.1:4599')
      expect(normalizedConcivUrl('http://127.0.0.1:4599/t/abc123')).toBe('http://127.0.0.1:4599/t/abc123')
    })

    it('strips the documented /native foot-gun so the swift sdk appends it once', () => {
      expect(normalizedConcivUrl('http://127.0.0.1:4599/native')).toBe('http://127.0.0.1:4599')
      expect(normalizedConcivUrl('http://127.0.0.1:4599/native/')).toBe('http://127.0.0.1:4599')
      expect(normalizedConcivUrl('http://127.0.0.1:4599/t/abc123/native')).toBe('http://127.0.0.1:4599/t/abc123')
    })

    it('rejects any other path suffix and points at the readme rule', () => {
      expect(concivUrlRejection('http://127.0.0.1:4599/native/x')).toContain('packages/extensions/ios/README.md')
      expect(concivUrlRejection('http://127.0.0.1:4599/panel')).toContain('appends /native itself')
    })
  })

  describe('ios config extra source dirs', () => {
    it('accepts extra source roots relative to the project root', () => {
      const parsed = parseIosConfig({buildMode: 'swiftc', extraSourceDirs: ['../ConcivWidget/Sources/ConcivWidget']})
      if (!parsed.success) throw new Error('expected the config to be accepted')
      expect(parsed.data?.extraSourceDirs).toEqual(['../ConcivWidget/Sources/ConcivWidget'])
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

describe('prompt', () => {
  const config: IosConfig = {
    projectRoot: 'apps/PayApp',
    bundleId: 'dev.conciv.pay',
    simulator: 'iPhone 17 Pro',
    buildMode: 'xcodebuild',
  }

  function prompt(overrides: Partial<IosConfig> = {}, cwd = '/Users/dev/pay'): string {
    return iosSystemPrompt({...config, ...overrides}, {cwd})
  }

  describe('iOS system prompt', () => {
    it('keeps steering the agent to ios_build instead of a demo build script', () => {
      expect(prompt()).not.toContain('build.sh')
      expect(prompt()).toContain('ios_build')
    })

    it('names the session it is serving: the app, the simulator, and the working directory', () => {
      const text = prompt()
      expect(text).toContain('/Users/dev/pay/apps/PayApp')
      expect(text).toContain('dev.conciv.pay')
      expect(text).toContain('iPhone 17 Pro')
      expect(text).toContain('Your working directory is /Users/dev/pay')
    })

    it('rules out filesystem-wide crawls and points searches at the project', () => {
      const text = prompt()
      expect(text).toContain('Never search from the filesystem root')
      expect(text).toContain('find /')
      expect(text).toContain('grep -rn "class PaymentCardCell" /Users/dev/pay/apps/PayApp')
    })

    it('uses an absolute project root as configured', () => {
      expect(prompt({projectRoot: '/opt/PayApp'})).toContain('the iOS project at /opt/PayApp,')
    })

    it('names the scheme when one is configured and says so when none is', () => {
      expect(prompt({scheme: 'PayApp'})).toContain('scheme PayApp')
      expect(prompt()).toContain('the default scheme')
    })

    it('lists extra swift source roots when the app keeps sources outside the project root', () => {
      expect(prompt({extraSourceDirs: ['../ConcivWidget/Sources']})).toContain('../ConcivWidget/Sources')
      expect(prompt()).not.toContain('Extra Swift sources')
    })

    it('still describes the native overlay the widget renders into', () => {
      expect(prompt()).toContain('transparent WebView')
    })

    it('explains that swift edits need a build and a run, not hot reload', () => {
      expect(prompt()).toContain('no hot reload')
    })
  })
})

describe('server tools', () => {
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

  function tempTwoRootSwiftProject(): {root: string; extraSourceDir: string} {
    const parent = mkdtempSync(join(tmpdir(), 'conciv-ios-roots-'))
    const root = join(parent, 'ConcivDemo')
    mkdirSync(join(root, 'Sources'), {recursive: true})
    writeFileSync(join(root, 'Sources', 'App.swift'), 'let app = 1\n')
    writeFileSync(join(root, 'Info.plist'), '<plist></plist>')
    const extraSourceDir = join(parent, 'ConcivWidget', 'Sources', 'ConcivWidget')
    mkdirSync(extraSourceDir, {recursive: true})
    writeFileSync(join(extraSourceDir, 'Overlay.swift'), 'let overlay = 1\n')
    return {root, extraSourceDir}
  }

  function tempBuiltSwiftProject(): string {
    const root = tempSwiftProject()
    mkdirSync(join(root, 'build', 'pay.app'), {recursive: true})
    return root
  }

  async function runFailingSwiftcBuild(scripts: Script[]) {
    const root = tempSwiftProject()
    const {runner, calls} = fakeRunner(scripts)
    const result = await runBuild({config: swiftcConfig(root), runner, cwd: root}, {})
    if ('error' in result) throw new Error('unexpected not-configured')
    expect(result.ok).toBe(false)
    expect(result.appPath).toBeNull()
    return {diagnostics: result.diagnostics, calls}
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

  describe('ios_build swiftc mode', () => {
    it('parses a real swiftc error transcript into diagnostics and reports failure', async () => {
      const {diagnostics, calls} = await runFailingSwiftcBuild([
        {when: (call) => has(call, '--show-sdk-path'), reply: {stdout: '/sdk/iphonesimulator'}},
        {when: (call) => has(call, 'swiftc'), reply: {code: 1, stderr: transcript('swiftc-error.txt')}},
      ])
      const typeError = diagnostics.find((d) => d.message.includes("cannot convert value of type 'String'"))
      expect(typeError?.severity).toBe('error')
      expect(typeError?.line).toBe(2)
      expect(typeError?.file.endsWith('Broken.swift')).toBe(true)
      const compile = calls.find((call) => has(call, 'swiftc'))
      expect(compile?.args).toContain('-target')
      expect(compile?.args.some((arg) => arg.endsWith('Broken.swift'))).toBe(true)
      expect(compile?.opts?.env?.DEVELOPER_DIR).toBe('/Applications/Xcode.app/Contents/Developer')
    })

    it('reports the raw swiftc stderr as a diagnostic when the failure has no canonical error lines', async () => {
      const {diagnostics} = await runFailingSwiftcBuild([
        {when: (call) => has(call, '--show-sdk-path'), reply: {stdout: '/sdk/iphonesimulator'}},
        {
          when: (call) => has(call, 'swiftc'),
          reply: {code: 1, stderr: "error: unable to load standard library for target 'arm64-apple-ios17.0-simulator'"},
        },
      ])
      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0]?.severity).toBe('error')
      expect(diagnostics[0]?.message).toContain('unable to load standard library')
    })

    it('compiles the project Sources tree together with the configured extra source roots', async () => {
      const {root, extraSourceDir} = tempTwoRootSwiftProject()
      const {runner, calls} = fakeRunner([
        {when: (call) => has(call, '--show-sdk-path'), reply: {stdout: '/sdk/iphonesimulator'}},
      ])
      const config = swiftcConfig(root, {extraSourceDirs: ['../ConcivWidget/Sources/ConcivWidget']})
      const result = await runBuild({config, runner, cwd: root}, {})
      if ('error' in result) throw new Error('unexpected not-configured')
      expect(result.ok).toBe(true)
      const compile = calls.find((call) => has(call, 'swiftc'))
      expect(compile?.args).toContain(join(root, 'Sources', 'App.swift'))
      expect(compile?.args).toContain(join(extraSourceDir, 'Overlay.swift'))
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

  describe('ios_build xcodebuild mode', () => {
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

    it('carries the raw command stderr as a diagnostic when the failure has no canonical error lines', async () => {
      const {runner, calls} = fakeRunner([
        {
          when: (call) => has(call, 'build'),
          reply: {
            code: 1,
            stderr:
              "xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory is a CLT instance",
          },
        },
      ])
      const result = await runBuild({config: xcodebuildConfig(), runner, cwd: '/tmp'}, {})
      if ('error' in result) throw new Error('unexpected not-configured')
      expect(result.ok).toBe(false)
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0]?.severity).toBe('error')
      expect(result.diagnostics[0]?.message).toContain('requires Xcode')
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
    it('selects the .app target matching the bundle id, skipping the framework entry', () => {
      expect(parseXcodebuildAppPath(transcript('xcodebuild-settings.json'), 'dev.conciv.pay')).toBe(
        '/Users/dev/Library/Developer/Xcode/DerivedData/PayApp/Build/Products/Debug-iphonesimulator/PayApp.app',
      )
    })

    it('picks the matching app even when it is not the first entry', () => {
      const settings = JSON.stringify([
        {
          buildSettings: {
            TARGET_BUILD_DIR: '/d',
            WRAPPER_NAME: 'PayAppTests.xctest',
            PRODUCT_BUNDLE_IDENTIFIER: 'dev.conciv.pay.tests',
          },
        },
        {
          buildSettings: {
            TARGET_BUILD_DIR: '/d',
            WRAPPER_NAME: 'PayApp.app',
            PRODUCT_BUNDLE_IDENTIFIER: 'dev.conciv.pay',
          },
        },
      ])
      expect(parseXcodebuildAppPath(settings, 'dev.conciv.pay')).toBe('/d/PayApp.app')
    })

    it('returns null for invalid json, a non-array, an unmatched bundle id, or a non-app wrapper', () => {
      expect(parseXcodebuildAppPath('not json', 'dev.conciv.pay')).toBeNull()
      expect(parseXcodebuildAppPath('{"buildSettings": {}}', 'dev.conciv.pay')).toBeNull()
      expect(parseXcodebuildAppPath('[]', 'dev.conciv.pay')).toBeNull()
      expect(
        parseXcodebuildAppPath('[{"buildSettings": {"TARGET_BUILD_DIR": "/only/dir"}}]', 'dev.conciv.pay'),
      ).toBeNull()
      expect(parseXcodebuildAppPath('[{}]', 'dev.conciv.pay')).toBeNull()
      const framework = JSON.stringify([
        {
          buildSettings: {
            TARGET_BUILD_DIR: '/d',
            WRAPPER_NAME: 'PayKit.framework',
            PRODUCT_BUNDLE_IDENTIFIER: 'dev.conciv.pay',
          },
        },
      ])
      expect(parseXcodebuildAppPath(framework, 'dev.conciv.pay')).toBeNull()
    })
  })

  function launchScenario(): {root: string; runner: SimctlRunner; calls: Call[]} {
    const root = tempBuiltSwiftProject()
    const {runner, calls} = fakeRunner([
      {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
      {when: (call) => has(call, 'launch'), reply: {stdout: 'dev.conciv.pay: 4210'}},
    ])
    return {root, runner, calls}
  }

  describe('ios_run', () => {
    it('resolves the booted udid, drives boot/install/terminate/launch, and passes SIMCTL_CHILD env', async () => {
      const {root, runner, calls} = launchScenario()
      const result = await runRun(
        {config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => 'http://127.0.0.1:8891'},
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
      expect(launch?.opts?.env?.SIMCTL_CHILD_CONCIV_URL).toBe('http://127.0.0.1:8891')
      expect(launch?.opts?.env?.SIMCTL_CHILD_CONCIV_AUTOSHOW).toBe('1')
    })

    it('exports the api base without the native page path so the swift sdk appends it once', async () => {
      const {root, runner, calls} = launchScenario()
      await runRun({config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => 'http://127.0.0.1:8891'}, {})
      const launch = calls.find((call) => has(call, 'launch'))
      const url = launch?.opts?.env?.SIMCTL_CHILD_CONCIV_URL
      expect(url).toBe('http://127.0.0.1:8891')
      expect(url?.endsWith('/native')).toBe(false)
    })

    it('prefers an explicit config concivUrl override over the core native url', async () => {
      const {root, runner, calls} = launchScenario()
      await runRun(
        {
          config: swiftcConfig(root, {concivUrl: 'http://127.0.0.1:4599'}),
          runner,
          cwd: root,
          nativeUrl: () => 'http://127.0.0.1:8891',
        },
        {},
      )
      const launch = calls.find((call) => has(call, 'launch'))
      expect(launch?.opts?.env?.SIMCTL_CHILD_CONCIV_URL).toBe('http://127.0.0.1:4599')
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

  describe('ios_build packaging steps are checked', () => {
    it('fails the build with diagnostics when plutil conversion fails', async () => {
      const {calls, diagnostics} = await runFailingSwiftcBuild([
        {when: (call) => has(call, '--show-sdk-path'), reply: {stdout: '/sdk/iphonesimulator'}},
        {when: (call) => call.cmd === 'plutil', reply: {code: 1, stderr: 'plutil: Info.plist is not a valid plist'}},
      ])
      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0]?.message).toContain('is not a valid plist')
      expect(calls.some((call) => call.cmd === 'codesign')).toBe(false)
    })

    it('fails the build with the codesign stderr as a diagnostic when codesign fails', async () => {
      const {diagnostics} = await runFailingSwiftcBuild([
        {when: (call) => has(call, '--show-sdk-path'), reply: {stdout: '/sdk/iphonesimulator'}},
        {when: (call) => call.cmd === 'codesign', reply: {code: 1, stderr: 'codesign: bundle format unrecognized'}},
      ])
      expect(diagnostics).toHaveLength(1)
      expect(diagnostics[0]?.severity).toBe('error')
      expect(diagnostics[0]?.message).toContain('bundle format unrecognized')
    })

    it('fails the build when Info.plist is missing rather than reporting an uninstallable bundle', async () => {
      const root = mkdtempSync(join(tmpdir(), 'conciv-ios-'))
      mkdirSync(join(root, 'Sources'), {recursive: true})
      writeFileSync(join(root, 'Sources', 'App.swift'), 'let value = 1\n')
      const {runner, calls} = fakeRunner([
        {when: (call) => has(call, '--show-sdk-path'), reply: {stdout: '/sdk/iphonesimulator'}},
      ])
      const result = await runBuild({config: swiftcConfig(root), runner, cwd: root}, {})
      if ('error' in result) throw new Error('unexpected not-configured')
      expect(result.ok).toBe(false)
      expect(result.appPath).toBeNull()
      expect(result.diagnostics.some((d) => d.message.includes('Info.plist not found'))).toBe(true)
      expect(calls.some((call) => call.cmd === 'plutil')).toBe(false)
      expect(calls.some((call) => call.cmd === 'codesign')).toBe(false)
    })
  })

  describe('ios_run install and device selection', () => {
    it('fails without terminating or launching when simctl install fails', async () => {
      const root = tempBuiltSwiftProject()
      const {runner, calls} = fakeRunner([
        {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
        {when: (call) => has(call, 'install'), reply: {code: 1, stderr: 'Failed to install the requested application'}},
      ])
      const result = await runRun({config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => undefined}, {})
      if (!('stage' in result)) throw new Error('expected a run failure')
      expect(result.ok).toBe(false)
      expect(calls.some((call) => has(call, 'terminate'))).toBe(false)
      expect(calls.some((call) => has(call, 'launch'))).toBe(false)
    })

    it('skips an unavailable duplicate-named runtime and picks the available simulator', async () => {
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
      const {runner, calls} = fakeRunner([
        {when: (call) => has(call, 'list'), reply: {stdout: JSON.stringify(devices)}},
        {when: (call) => has(call, 'launch'), reply: {stdout: 'dev.conciv.pay: 4210'}},
      ])
      const result = await runRun({config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => undefined}, {})
      if ('error' in result) throw new Error('unexpected not-configured')
      expect(result.udid).toBe('GOOD-UDID')
      expect(calls.some((call) => has(call, 'install') && has(call, 'GOOD-UDID'))).toBe(true)
    })
  })

  async function failedRun(ctx: IosToolContext): Promise<RunFailure> {
    const result = await runRun(ctx, {})
    if (!('stage' in result)) throw new Error('expected a run failure')
    return result
  }

  describe('ios_run failure stages are diagnosable', () => {
    it('reports the resolve-simulator stage when no simulator matches', async () => {
      const root = tempSwiftProject()
      const {runner} = fakeRunner([{when: (call) => has(call, 'list'), reply: {stdout: JSON.stringify({devices: {}})}}])
      const result = await failedRun({config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => undefined})
      expect(result.stage).toBe('resolve-simulator')
      expect(result.error).toContain('iPhone 17 Pro')
    })

    it('reports the boot stage with the command stderr when bootstatus fails', async () => {
      const root = tempSwiftProject()
      const {runner} = fakeRunner([
        {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
        {when: (call) => has(call, 'bootstatus'), reply: {code: 1, stderr: 'Unable to boot device in current state'}},
      ])
      const result = await failedRun({config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => undefined})
      expect(result.stage).toBe('boot')
      expect(result.error).toContain('Unable to boot device')
    })

    it('reports the artifact stage when no built .app resolves', async () => {
      const {runner} = fakeRunner([
        {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
        {when: (call) => has(call, '-showBuildSettings'), reply: {code: 1, stderr: 'no build settings'}},
      ])
      const result = await failedRun({config: xcodebuildConfig(), runner, cwd: '/tmp', nativeUrl: () => undefined})
      expect(result.stage).toBe('artifact')
      expect(result.error).toContain('ios_build')
    })

    it('reports the artifact stage naming the missing bundle when the project was never built', async () => {
      const root = tempSwiftProject()
      const {runner, calls} = fakeRunner([
        {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
      ])
      const result = await failedRun({config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => undefined})
      expect(result.stage).toBe('artifact')
      expect(result.error).toContain(join(root, 'build', 'pay.app'))
      expect(result.error).toContain('swiftc')
      expect(result.error).toContain('ios_build')
      expect(calls.some((call) => has(call, 'install'))).toBe(false)
    })

    it('reports the install stage with the command stderr and stops before terminate/launch', async () => {
      const root = tempBuiltSwiftProject()
      const {runner, calls} = fakeRunner([
        {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
        {when: (call) => has(call, 'install'), reply: {code: 1, stderr: 'Failed to install the requested application'}},
      ])
      const result = await failedRun({config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => undefined})
      expect(result.stage).toBe('install')
      expect(result.error).toContain('Failed to install')
      expect(calls.some((call) => has(call, 'terminate'))).toBe(false)
      expect(calls.some((call) => has(call, 'launch'))).toBe(false)
    })

    it('reports the launch stage with the command stderr when simctl launch fails', async () => {
      const root = tempBuiltSwiftProject()
      const {runner} = fakeRunner([
        {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
        {when: (call) => has(call, 'launch'), reply: {code: 1, stderr: 'The request to launch was denied'}},
      ])
      const result = await failedRun({config: swiftcConfig(root), runner, cwd: root, nativeUrl: () => undefined})
      expect(result.stage).toBe('launch')
      expect(result.error).toContain('launch was denied')
    })
  })

  describe('ios_screenshot', () => {
    it('returns an imageResult with png dimensions parsed from the byte stream', async () => {
      const png = Buffer.from(PNG_RED_4x4_BASE64, 'base64')
      const {runner} = fakeRunner([
        {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
        {when: (call) => has(call, 'screenshot'), reply: {stdout: png}},
      ])
      const result = await runScreenshot({config: swiftcConfig('/tmp'), runner, cwd: '/tmp'})
      if (!Array.isArray(result)) throw new Error('expected an image result, got a not-configured response')
      expect(result).toEqual([
        {type: 'image', source: {type: 'data', value: PNG_RED_4x4_BASE64, mimeType: 'image/png'}},
        {type: 'text', content: JSON.stringify({width: 4, height: 4})},
      ])
    })
  })

  async function failedLogs(ctx: IosToolContext, input: {predicate?: string} = {}): Promise<LogsFailure> {
    const result = await runLogs(ctx, input)
    if (result.ok || !('lines' in result)) throw new Error('expected a logs failure')
    return result
  }

  describe('ios_logs', () => {
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
      if (!limited.ok) throw new Error('expected a logs success')
      expect(limited.lines).toEqual(['2026-07-24 10:15:03.010 PayApp[4210:99] overlay attached'])
    })

    it('reports an error when no simulator matches instead of a silent empty result', async () => {
      const {runner} = fakeRunner([{when: (call) => has(call, 'list'), reply: {stdout: JSON.stringify({devices: {}})}}])
      const result = await failedLogs({config: swiftcConfig('/tmp'), runner, cwd: '/tmp'})
      expect(result.lines).toEqual([])
      expect(result.error).toContain('ios_logs')
    })

    it('surfaces the log show stderr on failure so an invalid predicate is diagnosable', async () => {
      const {runner} = fakeRunner([
        {when: (call) => has(call, 'list'), reply: {stdout: transcript('simctl-list.json')}},
        {
          when: (call) => has(call, 'show'),
          reply: {code: 1, stderr: 'log: Invalid predicate: unknown identifier "bad"'},
        },
      ])
      const result = await failedLogs({config: swiftcConfig('/tmp'), runner, cwd: '/tmp'}, {predicate: 'bad'})
      expect(result.lines).toEqual([])
      expect(result.error).toContain('Invalid predicate')
    })
  })
})

describe('tool catalog', () => {
  const extensions: AnyExtension[] = [iosExtension]

  async function boot(): Promise<{base: string; engine: Engine}> {
    const engine = await start({
      options: {systemPrompt: false, stateRoot: mkdtempSync(join(tmpdir(), 'conciv-ios-catalog-state-'))},
      root: mkdtempSync(join(tmpdir(), 'conciv-ios-catalog-root-')),
      launchEditor: () => {},
      extensions,
    })
    return {base: `http://127.0.0.1:${engine.port}`, engine}
  }

  function runSandbox(base: string, typescriptCode: string): Promise<unknown> {
    return makeRunTypescript(base, '')(typescriptCode)
  }

  const CatalogList = z.object({
    tools: z.array(
      z
        .object({
          call: z.string(),
          name: z.string(),
          summary: z.string(),
          category: z.string(),
          mutating: z.boolean(),
          approval: z.literal('ask').optional(),
        })
        .loose(),
    ),
  })

  const CatalogDetail = z
    .object({call: z.string(), name: z.string(), output: z.unknown(), errors: z.array(z.unknown())})
    .loose()

  const DECLARED: Record<string, {mutating: boolean; approval: 'ask' | undefined}> = {
    ios_build: {mutating: true, approval: 'ask'},
    ios_run: {mutating: true, approval: 'ask'},
    ios_screenshot: {mutating: false, approval: undefined},
    ios_logs: {mutating: false, approval: undefined},
  }

  describe('the ios tools ride the tool registry into the catalog and the sandbox (IT)', () => {
    it('lists all four declarations under the ios category with honest mutating and approval flags', async () => {
      const {base, engine} = await boot()
      try {
        const listed = CatalogList.parse(await runSandbox(base, "return await external_catalog({search: 'ios'})"))
        const iosTools = listed.tools.filter((tool) => tool.category === 'ios')
        expect(new Set(iosTools.map((tool) => tool.name))).toEqual(new Set(Object.keys(DECLARED)))
        for (const [name, expected] of Object.entries(DECLARED)) {
          const entry = iosTools.find((tool) => tool.name === name)
          expect(entry?.mutating, name).toBe(expected.mutating)
          expect(entry?.approval, name).toBe(expected.approval)
          expect(entry?.summary, name).not.toBe('')
        }
      } finally {
        await engine.stop()
      }
    }, 60_000)

    it('carries an image-shaped output schema for ios_screenshot and a diagnostics-shaped one for ios_build', async () => {
      const {base, engine} = await boot()
      try {
        const screenshot = CatalogDetail.parse(
          await runSandbox(base, "return await external_catalog({name: 'ios_screenshot'})"),
        )
        expect(JSON.stringify(screenshot.output)).toContain('image')
        const build = CatalogDetail.parse(await runSandbox(base, "return await external_catalog({name: 'ios_build'})"))
        expect(JSON.stringify(build.output)).toContain('diagnostics')
      } finally {
        await engine.stop()
      }
    }, 60_000)

    it('is callable through code-mode: an unconfigured ios extension answers its declared not-configured shape', async () => {
      const {base, engine} = await boot()
      try {
        const answered = z
          .object({category: z.string(), answer: z.object({ok: z.literal(false), error: z.string()}).loose()})
          .parse(
            await runSandbox(
              base,
              [
                "const found = await external_catalog({name: 'ios_logs'})",
                'const answer = await globalThis[found.call]({})',
                'return {category: found.category, answer}',
              ].join('\n'),
            ),
          )
        expect(answered.category).toBe('ios')
        expect(answered.answer.error).toContain('not configured')
      } finally {
        await engine.stop()
      }
    }, 60_000)
  })
})
