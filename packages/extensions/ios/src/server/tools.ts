import {arch as osArch} from 'node:os'
import {existsSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {imageResult, type ContentPart} from '@conciv/extension'
import {DEFAULT_DEVELOPER_DIR, type IosConfig} from '../shared/meta.js'
import {parseDiagnostics, type Diagnostic} from './diagnostics.js'
import type {RunResult, SimctlRunner} from './simctl-runner.js'

export type IosToolContext = {
  config: IosConfig | undefined
  runner: SimctlRunner
  cwd: string
  nativeUrl?: () => string | undefined
}

export type NotConfigured = {ok: false; error: string}

export type BuildOutput =
  | NotConfigured
  | {ok: boolean; appPath: string | null; durationMs: number; diagnostics: Diagnostic[]}

export type RunStage = 'resolve-simulator' | 'boot' | 'artifact' | 'install' | 'launch'

export type RunFailure = {ok: false; udid: string; bundleId: string; stage: RunStage; error: string}

export type RunOutput = NotConfigured | {ok: true; udid: string; bundleId: string; pid?: number} | RunFailure

export type LogsSuccess = {ok: true; lines: string[]}

export type LogsFailure = {ok: false; lines: string[]; error: string}

export type LogsOutput = NotConfigured | LogsSuccess | LogsFailure

const NOT_CONFIGURED: NotConfigured = {ok: false, error: 'ios extension not configured'}

const DEFAULT_LOG_LINES = 500

const ERROR_TAIL_LINES = 40

function developerEnv(config: IosConfig): Record<string, string> {
  return {DEVELOPER_DIR: config.developerDir ?? DEFAULT_DEVELOPER_DIR}
}

function moduleName(config: IosConfig): string {
  if (config.scheme) return config.scheme
  const tail = config.bundleId.split('.').at(-1) ?? config.bundleId
  return tail.replace(/[^A-Za-z0-9_]/g, '')
}

function projectDir(config: IosConfig, cwd: string): string {
  return config.projectRoot.startsWith('/') ? config.projectRoot : join(cwd, config.projectRoot)
}

function destination(config: IosConfig): string {
  return `platform=iOS Simulator,name=${config.simulator}`
}

function stdoutText(result: RunResult): string {
  return result.stdout.toString('utf8')
}

function walkSwiftSources(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walkSwiftSources(full)
    if (entry.name.endsWith('.swift')) return [full]
    return []
  })
}

function resolveSourceRoot(root: string, dir: string): string {
  return dir.startsWith('/') ? dir : join(root, dir)
}

function collectSwiftSources(root: string, extraSourceDirs: string[]): string[] {
  const roots = [join(root, 'Sources'), ...extraSourceDirs.map((dir) => resolveSourceRoot(root, dir))]
  const files = roots.filter((dir) => existsSync(dir)).flatMap(walkSwiftSources)
  return [...new Set(files)].toSorted()
}

function swiftTarget(): string {
  const map: Record<string, string> = {arm64: 'arm64', x64: 'x86_64'}
  const cpu = map[osArch()] ?? osArch()
  return `${cpu}-apple-ios17.0-simulator`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringField(source: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = source?.[key]
  return typeof value === 'string' ? value : undefined
}

function appTargetPath(entry: unknown, bundleId: string): string | null {
  if (!isRecord(entry) || !isRecord(entry.buildSettings)) return null
  const settings = entry.buildSettings
  if (stringField(settings, 'PRODUCT_BUNDLE_IDENTIFIER') !== bundleId) return null
  const dir = stringField(settings, 'TARGET_BUILD_DIR')
  const wrapper = stringField(settings, 'WRAPPER_NAME')
  if (dir === undefined || wrapper === undefined || !wrapper.endsWith('.app')) return null
  return join(dir, wrapper)
}

export function parseXcodebuildAppPath(text: string, bundleId: string): string | null {
  const parsed = safeJson(text)
  if (!Array.isArray(parsed)) return null
  return parsed.map((entry) => appTargetPath(entry, bundleId)).find((path) => path !== null) ?? null
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function resolveXcodebuildAppPath(ctx: IosToolContext, config: IosConfig): Promise<string | null> {
  const schemeArgs = config.scheme ? ['-scheme', config.scheme] : []
  const settings = await ctx.runner.run(
    'xcrun',
    ['xcodebuild', ...schemeArgs, '-destination', destination(config), '-showBuildSettings', '-json'],
    {cwd: projectDir(config, ctx.cwd), env: developerEnv(config)},
  )
  if (settings.code !== 0) return null
  return parseXcodebuildAppPath(stdoutText(settings), config.bundleId)
}

async function buildXcodebuild(ctx: IosToolContext, config: IosConfig, clean: boolean): Promise<BuildOutput> {
  const schemeArgs = config.scheme ? ['-scheme', config.scheme] : []
  const actions = clean ? ['clean', 'build'] : ['build']
  const started = Date.now()
  const result = await ctx.runner.run(
    'xcrun',
    ['xcodebuild', ...schemeArgs, '-destination', destination(config), ...actions],
    {cwd: projectDir(config, ctx.cwd), env: developerEnv(config)},
  )
  const durationMs = Date.now() - started
  const parsed = parseDiagnostics(`${stdoutText(result)}\n${result.stderr}`)
  const ok = result.code === 0
  const diagnostics = reportedDiagnostics(parsed, ok, result, 'xcodebuild failed')
  const appPath = ok ? await resolveXcodebuildAppPath(ctx, config) : null
  return {ok, appPath, durationMs, diagnostics}
}

async function buildSwiftc(ctx: IosToolContext, config: IosConfig, clean: boolean): Promise<BuildOutput> {
  const root = projectDir(config, ctx.cwd)
  const env = developerEnv(config)
  const module = moduleName(config)
  const appDir = join(root, 'build', `${module}.app`)
  const started = Date.now()

  if (clean) rmSync(appDir, {recursive: true, force: true})

  const sdk = await ctx.runner.run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], {cwd: root, env})
  if (sdk.code !== 0) {
    const diagnostics = reportedDiagnostics(parseDiagnostics(sdk.stderr), false, sdk, 'xcrun --show-sdk-path failed')
    return {ok: false, appPath: null, durationMs: Date.now() - started, diagnostics}
  }
  const sdkPath = stdoutText(sdk).trim()
  const sources = collectSwiftSources(root, config.extraSourceDirs ?? [])
  mkdirSync(appDir, {recursive: true})

  const compile = await ctx.runner.run(
    'xcrun',
    [
      '--sdk',
      'iphonesimulator',
      'swiftc',
      '-sdk',
      sdkPath,
      '-target',
      swiftTarget(),
      '-module-name',
      module,
      '-O',
      '-D',
      'DEBUG',
      '-framework',
      'UIKit',
      '-framework',
      'WebKit',
      '-o',
      join(appDir, module),
      ...sources,
    ],
    {cwd: root, env},
  )
  const diagnostics = parseDiagnostics(`${stdoutText(compile)}\n${compile.stderr}`)
  if (compile.code !== 0) {
    return {
      ok: false,
      appPath: null,
      durationMs: Date.now() - started,
      diagnostics: commandFailureDiagnostics(compile, 'swiftc failed'),
    }
  }

  const infoPlist = join(root, 'Info.plist')
  if (!existsSync(infoPlist)) {
    return {
      ok: false,
      appPath: null,
      durationMs: Date.now() - started,
      diagnostics: [...diagnostics, missingPlistDiagnostic(infoPlist)],
    }
  }
  const plist = await ctx.runner.run('plutil', ['-convert', 'binary1', '-o', join(appDir, 'Info.plist'), infoPlist], {
    cwd: root,
    env,
  })
  if (plist.code !== 0) {
    return {
      ok: false,
      appPath: null,
      durationMs: Date.now() - started,
      diagnostics: commandFailureDiagnostics(plist, 'plutil failed to convert Info.plist'),
    }
  }
  writeFileSync(join(appDir, 'PkgInfo'), 'APPL????')
  const signed = await ctx.runner.run('codesign', ['--force', '--sign', '-', '--timestamp=none', appDir], {
    cwd: root,
    env,
  })
  if (signed.code !== 0) {
    return {
      ok: false,
      appPath: null,
      durationMs: Date.now() - started,
      diagnostics: commandFailureDiagnostics(signed, 'codesign failed'),
    }
  }
  return {ok: true, appPath: appDir, durationMs: Date.now() - started, diagnostics}
}

function commandFailureDiagnostics(result: RunResult, fallback: string): Diagnostic[] {
  const parsed = parseDiagnostics(`${stdoutText(result)}\n${result.stderr}`)
  return reportedDiagnostics(parsed, false, result, fallback)
}

function missingPlistDiagnostic(path: string): Diagnostic {
  return {
    file: path,
    line: 0,
    severity: 'error',
    message: 'Info.plist not found: swiftc mode cannot assemble an installable .app bundle without it',
  }
}

export async function runBuild(ctx: IosToolContext, input: {clean?: boolean}): Promise<BuildOutput> {
  if (!ctx.config) return NOT_CONFIGURED
  const clean = input.clean ?? false
  if (ctx.config.buildMode === 'swiftc') return buildSwiftc(ctx, ctx.config, clean)
  return buildXcodebuild(ctx, ctx.config, clean)
}

type SimDevice = {udid: string; name: string; state?: string; isAvailable?: boolean}

function parseSimDevice(value: unknown): SimDevice | null {
  if (!isRecord(value)) return null
  const {udid, name} = value
  if (typeof udid !== 'string' || typeof name !== 'string') return null
  return {
    udid,
    name,
    state: typeof value.state === 'string' ? value.state : undefined,
    isAvailable: typeof value.isAvailable === 'boolean' ? value.isAvailable : undefined,
  }
}

function parseSimDevices(parsed: unknown): SimDevice[] {
  if (!isRecord(parsed) || !isRecord(parsed.devices)) return []
  return Object.values(parsed.devices).flatMap((group) =>
    Array.isArray(group) ? group.flatMap((entry) => parseSimDevice(entry) ?? []) : [],
  )
}

async function resolveUdid(ctx: IosToolContext, config: IosConfig): Promise<string | null> {
  const listed = await ctx.runner.run('xcrun', ['simctl', 'list', '-j', 'devices'], {env: developerEnv(config)})
  if (listed.code !== 0) return null
  const available = parseSimDevices(safeJson(stdoutText(listed))).filter((device) => device.isAvailable !== false)
  const wanted = config.simulator
  const matches = available.filter((device) => device.udid === wanted || device.name === wanted)
  const booted = matches.find((device) => device.state === 'Booted')
  return (booted ?? matches[0])?.udid ?? null
}

type AppArtifact = {ok: true; appPath: string} | {ok: false; error: string}

function missingArtifact(path: string, mode: IosConfig['buildMode']): AppArtifact {
  return {ok: false, error: `no built .app at ${path} (${mode} build mode): run ios.build before ios.run`}
}

async function resolveAppPath(ctx: IosToolContext, config: IosConfig): Promise<AppArtifact> {
  if (config.buildMode === 'swiftc') {
    const appPath = join(projectDir(config, ctx.cwd), 'build', `${moduleName(config)}.app`)
    return existsSync(appPath) ? {ok: true, appPath} : missingArtifact(appPath, 'swiftc')
  }
  const resolved = await resolveXcodebuildAppPath(ctx, config)
  if (resolved === null) {
    return {ok: false, error: 'no built .app found in the xcodebuild settings: run ios.build before ios.run'}
  }
  return existsSync(resolved) ? {ok: true, appPath: resolved} : missingArtifact(resolved, 'xcodebuild')
}

function resolveConcivUrl(config: IosConfig, ctx: IosToolContext): string | undefined {
  return config.concivUrl ?? ctx.nativeUrl?.()
}

function launchEnv(config: IosConfig, ctx: IosToolContext, autoshow: boolean): Record<string, string> {
  const env: Record<string, string> = {...developerEnv(config)}
  const concivUrl = resolveConcivUrl(config, ctx)
  if (concivUrl) env.SIMCTL_CHILD_CONCIV_URL = concivUrl
  if (autoshow) env.SIMCTL_CHILD_CONCIV_AUTOSHOW = '1'
  return env
}

function parseLaunchedPid(result: RunResult): number | undefined {
  const match = /:\s*(\d+)\s*$/.exec(stdoutText(result).trim())
  const pid = match?.[1]
  return pid ? Number(pid) : undefined
}

function runFailure(udid: string, bundleId: string, stage: RunStage, error: string): RunFailure {
  return {ok: false, udid, bundleId, stage, error}
}

function commandError(result: RunResult, fallback: string): string {
  const stderr = result.stderr.trim()
  if (stderr.length > 0) return stderr
  const stdout = stdoutText(result).trim()
  return stdout.length > 0 ? stdout : fallback
}

function boundedCommandError(result: RunResult, fallback: string): string {
  const message = commandError(result, fallback)
  const lines = message.split('\n')
  return lines.length <= ERROR_TAIL_LINES ? message : lines.slice(-ERROR_TAIL_LINES).join('\n')
}

function commandDiagnostic(result: RunResult, fallback: string): Diagnostic {
  return {file: '', line: 0, severity: 'error', message: boundedCommandError(result, fallback)}
}

function reportedDiagnostics(
  diagnostics: Diagnostic[],
  ok: boolean,
  result: RunResult,
  fallback: string,
): Diagnostic[] {
  if (ok || diagnostics.length > 0) return diagnostics
  return [commandDiagnostic(result, fallback)]
}

export async function runRun(ctx: IosToolContext, input: {autoshow?: boolean}): Promise<RunOutput> {
  if (!ctx.config) return NOT_CONFIGURED
  const config = ctx.config
  const udid = await resolveUdid(ctx, config)
  if (!udid) {
    return runFailure('', config.bundleId, 'resolve-simulator', `no available simulator matching ${config.simulator}`)
  }
  const env = developerEnv(config)
  await ctx.runner.run('xcrun', ['simctl', 'boot', udid], {env})
  const booted = await ctx.runner.run('xcrun', ['simctl', 'bootstatus', udid, '-b'], {env})
  if (booted.code !== 0)
    return runFailure(udid, config.bundleId, 'boot', commandError(booted, 'simulator failed to boot'))
  const artifact = await resolveAppPath(ctx, config)
  if (!artifact.ok) return runFailure(udid, config.bundleId, 'artifact', artifact.error)
  const installed = await ctx.runner.run('xcrun', ['simctl', 'install', udid, artifact.appPath], {env})
  if (installed.code !== 0) {
    return runFailure(
      udid,
      config.bundleId,
      'install',
      commandError(installed, `simctl install failed for ${artifact.appPath}`),
    )
  }
  await ctx.runner.run('xcrun', ['simctl', 'terminate', udid, config.bundleId], {env})
  const launched = await ctx.runner.run('xcrun', ['simctl', 'launch', udid, config.bundleId], {
    env: launchEnv(config, ctx, input.autoshow ?? false),
  })
  if (launched.code !== 0) {
    return runFailure(
      udid,
      config.bundleId,
      'launch',
      commandError(launched, `simctl launch failed for ${config.bundleId}`),
    )
  }
  const pid = parseLaunchedPid(launched)
  return pid === undefined
    ? {ok: true, udid, bundleId: config.bundleId}
    : {ok: true, udid, bundleId: config.bundleId, pid}
}

function pngDimensions(png: Buffer): {width: number; height: number} {
  if (png.length < 24) return {width: 0, height: 0}
  return {width: png.readUInt32BE(16), height: png.readUInt32BE(20)}
}

export async function runScreenshot(ctx: IosToolContext): Promise<ContentPart[] | NotConfigured> {
  if (!ctx.config) return NOT_CONFIGURED
  const config = ctx.config
  const udid = await resolveUdid(ctx, config)
  if (!udid) return {ok: false, error: 'no matching simulator for ios.screenshot'}
  const shot = await ctx.runner.run('xcrun', ['simctl', 'io', udid, 'screenshot', '--type', 'png', '-'], {
    env: developerEnv(config),
  })
  if (shot.code !== 0) return {ok: false, error: shot.stderr.trim() || 'ios.screenshot failed'}
  const {width, height} = pngDimensions(shot.stdout)
  return imageResult('image/png', shot.stdout.toString('base64'), {width, height})
}

export async function runLogs(
  ctx: IosToolContext,
  input: {sinceSeconds?: number; predicate?: string; limit?: number},
): Promise<LogsOutput> {
  if (!ctx.config) return NOT_CONFIGURED
  const config = ctx.config
  const udid = await resolveUdid(ctx, config)
  if (!udid) return {ok: false, lines: [], error: 'no matching simulator for ios.logs'}
  const sinceSeconds = input.sinceSeconds ?? 60
  const args = [
    'simctl',
    'spawn',
    udid,
    'log',
    'show',
    '--style',
    'compact',
    '--last',
    `${sinceSeconds}s`,
    ...(input.predicate ? ['--predicate', input.predicate] : []),
  ]
  const logged = await ctx.runner.run('xcrun', args, {env: developerEnv(config)})
  if (logged.code !== 0) return {ok: false, lines: [], error: boundedCommandError(logged, 'log show failed')}
  const lines = stdoutText(logged)
    .split('\n')
    .filter((line) => line.length > 0)
  const limit = input.limit && input.limit > 0 ? input.limit : DEFAULT_LOG_LINES
  return {ok: true, lines: lines.slice(-limit)}
}
