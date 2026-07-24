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

export type RunOutput = NotConfigured | {ok: boolean; udid: string; bundleId: string; pid?: number}

export type LogsOutput = NotConfigured | {ok: boolean; lines: string[]}

const NOT_CONFIGURED: NotConfigured = {ok: false, error: 'ios extension not configured'}

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

function collectSwiftSources(root: string): string[] {
  const sources: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.swift')) sources.push(full)
    }
  }
  const sourcesDir = join(root, 'Sources')
  if (existsSync(sourcesDir)) walk(sourcesDir)
  return sources.toSorted()
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

export function parseXcodebuildAppPath(text: string): string | null {
  const parsed = safeJson(text)
  if (!Array.isArray(parsed)) return null
  const first = parsed[0]
  const settings = isRecord(first) && isRecord(first.buildSettings) ? first.buildSettings : undefined
  const dir = stringField(settings, 'TARGET_BUILD_DIR')
  const wrapper = stringField(settings, 'WRAPPER_NAME')
  if (dir === undefined || wrapper === undefined) return null
  return join(dir, wrapper)
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
  return parseXcodebuildAppPath(stdoutText(settings))
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
  const diagnostics = parseDiagnostics(`${stdoutText(result)}\n${result.stderr}`)
  const ok = result.code === 0
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
    return {ok: false, appPath: null, durationMs: Date.now() - started, diagnostics: parseDiagnostics(sdk.stderr)}
  }
  const sdkPath = stdoutText(sdk).trim()
  const sources = collectSwiftSources(root)
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
  const durationMs = Date.now() - started
  const diagnostics = parseDiagnostics(`${stdoutText(compile)}\n${compile.stderr}`)
  if (compile.code !== 0) return {ok: false, appPath: null, durationMs, diagnostics}

  const infoPlist = join(root, 'Info.plist')
  if (existsSync(infoPlist)) {
    await ctx.runner.run('plutil', ['-convert', 'binary1', '-o', join(appDir, 'Info.plist'), infoPlist], {
      cwd: root,
      env,
    })
    writeFileSync(join(appDir, 'PkgInfo'), 'APPL????')
    await ctx.runner.run('codesign', ['--force', '--sign', '-', '--timestamp=none', appDir], {cwd: root, env})
  }
  return {ok: true, appPath: appDir, durationMs, diagnostics}
}

export async function runBuild(ctx: IosToolContext, input: {clean?: boolean}): Promise<BuildOutput> {
  if (!ctx.config) return NOT_CONFIGURED
  const clean = input.clean ?? false
  if (ctx.config.buildMode === 'swiftc') return buildSwiftc(ctx, ctx.config, clean)
  return buildXcodebuild(ctx, ctx.config, clean)
}

type SimDevice = {udid?: string; name?: string; state?: string}

async function resolveUdid(ctx: IosToolContext, config: IosConfig): Promise<string | null> {
  const listed = await ctx.runner.run('xcrun', ['simctl', 'list', '-j', 'devices'], {env: developerEnv(config)})
  if (listed.code !== 0) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(stdoutText(listed))
  } catch {
    return null
  }
  const devices =
    parsed && typeof parsed === 'object' ? (parsed as {devices?: Record<string, SimDevice[]>}).devices : undefined
  if (!devices) return null
  const all = Object.values(devices).flat()
  const wanted = config.simulator
  const matches = all.filter((device) => device.udid === wanted || device.name === wanted)
  const booted = matches.find((device) => device.state === 'Booted')
  const chosen = booted ?? matches[0]
  return chosen?.udid ?? null
}

async function resolveAppPath(ctx: IosToolContext, config: IosConfig): Promise<string | null> {
  if (config.buildMode === 'swiftc') return join(projectDir(config, ctx.cwd), 'build', `${moduleName(config)}.app`)
  return resolveXcodebuildAppPath(ctx, config)
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

export async function runRun(ctx: IosToolContext, input: {autoshow?: boolean}): Promise<RunOutput> {
  if (!ctx.config) return NOT_CONFIGURED
  const config = ctx.config
  const udid = await resolveUdid(ctx, config)
  if (!udid) return {ok: false, udid: '', bundleId: config.bundleId}
  const env = developerEnv(config)
  await ctx.runner.run('xcrun', ['simctl', 'boot', udid], {env})
  const appPath = await resolveAppPath(ctx, config)
  if (!appPath) return {ok: false, udid, bundleId: config.bundleId}
  await ctx.runner.run('xcrun', ['simctl', 'install', udid, appPath], {env})
  await ctx.runner.run('xcrun', ['simctl', 'terminate', udid, config.bundleId], {env})
  const launched = await ctx.runner.run('xcrun', ['simctl', 'launch', udid, config.bundleId], {
    env: launchEnv(config, ctx, input.autoshow ?? false),
  })
  if (launched.code !== 0) return {ok: false, udid, bundleId: config.bundleId}
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
  if (!udid) return {ok: false, lines: []}
  const sinceSeconds = input.sinceSeconds ?? 60
  const args = ['simctl', 'spawn', udid, 'log', 'show', '--style', 'compact', '--last', `${sinceSeconds}s`]
  if (input.predicate) args.push('--predicate', input.predicate)
  const logged = await ctx.runner.run('xcrun', args, {env: developerEnv(config)})
  if (logged.code !== 0) return {ok: false, lines: []}
  const lines = stdoutText(logged)
    .split('\n')
    .filter((line) => line.length > 0)
  const limit = input.limit
  return {ok: true, lines: limit && limit > 0 ? lines.slice(-limit) : lines}
}
