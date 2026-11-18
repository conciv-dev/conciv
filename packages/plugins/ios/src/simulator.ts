import {existsSync} from 'node:fs'
import {join} from 'node:path'
import {Effect} from 'effect'
import {z} from 'zod'
import type {Tool} from '@conciv/plugin/schema/tool'
import {resolveXcodebuildAppPath} from './build.js'
import {developerEnv, moduleName, NotConfiguredSchema, projectDir, type IosConfig, type IosRuntime} from './config.js'
import * as Simctl from './simctl.js'
import {boundedCommandError, commandError, isRecord, safeJson, stdoutText} from './simctl.js'

const RunStageSchema = z.enum(['resolve-simulator', 'boot', 'artifact', 'install', 'launch'])

type RunStage = z.infer<typeof RunStageSchema>

const RunFailureSchema = z.object({
  ok: z.literal(false),
  udid: z.string(),
  bundleId: z.string(),
  stage: RunStageSchema,
  error: z.string(),
})

export type RunFailure = z.infer<typeof RunFailureSchema>

const RunSuccessSchema = z.object({
  ok: z.literal(true),
  udid: z.string(),
  bundleId: z.string(),
  pid: z.number().optional(),
})

type Run = z.infer<typeof RunSuccessSchema> | RunFailure

export const RunOutputSchema = z.union([RunSuccessSchema, RunFailureSchema, NotConfiguredSchema])

const LogsSuccessSchema = z.object({ok: z.literal(true), lines: z.array(z.string())})

const LogsFailureSchema = z.object({ok: z.literal(false), lines: z.array(z.string()), error: z.string()})

type Logs = z.infer<typeof LogsSuccessSchema> | z.infer<typeof LogsFailureSchema>

export const LogsOutputSchema = z.union([LogsSuccessSchema, LogsFailureSchema, NotConfiguredSchema])

const ScreenSizeSchema = z.object({ok: z.literal(true), width: z.number(), height: z.number()})

export const ScreenshotOutputSchema = z.union([ScreenSizeSchema, NotConfiguredSchema])

type Screenshot = {output: z.infer<typeof ScreenshotOutputSchema>; content: Tool.FileContent[]}

const DEFAULT_LOG_LINES = 500

const DEFAULT_LOG_SECONDS = 60

type SimDevice = {udid: string; name: string; state?: string; isAvailable?: boolean}

function parseSimDevice(value: unknown): SimDevice | null {
  if (!isRecord(value)) return null
  const {udid, name} = value
  if (typeof udid !== 'string' || typeof name !== 'string') return null
  return {
    udid,
    name,
    ...(typeof value.state === 'string' ? {state: value.state} : {}),
    ...(typeof value.isAvailable === 'boolean' ? {isAvailable: value.isAvailable} : {}),
  }
}

function parseSimDevices(parsed: unknown): SimDevice[] {
  if (!isRecord(parsed) || !isRecord(parsed.devices)) return []
  return Object.values(parsed.devices).flatMap((group) =>
    Array.isArray(group) ? group.flatMap((entry) => parseSimDevice(entry) ?? []) : [],
  )
}

const resolveUdid = Effect.fn('IosSimulator.resolveUdid')(function* (config: IosConfig) {
  const simctl = yield* Simctl.Service
  const listed = yield* simctl.run('xcrun', ['simctl', 'list', '-j', 'devices'], {env: developerEnv(config)})
  if (listed.code !== 0) return null
  const available = parseSimDevices(safeJson(stdoutText(listed))).filter((device) => device.isAvailable !== false)
  const matches = available.filter((device) => device.udid === config.simulator || device.name === config.simulator)
  const booted = matches.find((device) => device.state === 'Booted')
  return (booted ?? matches[0])?.udid ?? null
})

type AppArtifact = {ok: true; appPath: string} | {ok: false; error: string}

function existingArtifact(appPath: string, mode: IosConfig['buildMode']): AppArtifact {
  return existsSync(appPath) ? {ok: true, appPath} : missingArtifact(appPath, mode)
}

function missingArtifact(path: string, mode: IosConfig['buildMode']): AppArtifact {
  return {ok: false, error: `no built .app at ${path} (${mode} build mode): run ios_build before ios_run`}
}

const resolveAppPath = Effect.fn('IosSimulator.resolveAppPath')(function* (runtime: IosRuntime) {
  const config = runtime.config
  if (config.buildMode === 'swiftc') {
    const appPath = join(projectDir(config, runtime.cwd), 'build', `${moduleName(config)}.app`)
    return existingArtifact(appPath, 'swiftc')
  }
  const resolved = yield* resolveXcodebuildAppPath(runtime)
  if (resolved === null) {
    const unresolved: AppArtifact = {
      ok: false,
      error: 'no built .app found in the xcodebuild settings: run ios_build before ios_run',
    }
    return unresolved
  }
  return existingArtifact(resolved, 'xcodebuild')
})

function launchEnv(runtime: IosRuntime, autoshow: boolean): Record<string, string> {
  const concivUrl = runtime.config.concivUrl ?? runtime.concivUrl()
  return {
    ...developerEnv(runtime.config),
    ...(concivUrl ? {SIMCTL_CHILD_CONCIV_URL: concivUrl} : {}),
    ...(autoshow ? {SIMCTL_CHILD_CONCIV_AUTOSHOW: '1'} : {}),
  }
}

function parseLaunchedPid(result: Simctl.RunResult): number | undefined {
  const pid = /:\s*(\d+)\s*$/.exec(stdoutText(result).trim())?.[1]
  return pid ? Number(pid) : undefined
}

function runFailure(udid: string, bundleId: string, stage: RunStage, error: string): RunFailure {
  return {ok: false, udid, bundleId, stage, error}
}

export const run = Effect.fn('IosSimulator.run')(function* (
  runtime: IosRuntime,
  input: {autoshow?: boolean | undefined},
) {
  const simctl = yield* Simctl.Service
  const config = runtime.config
  const bundleId = config.bundleId
  const udid = yield* resolveUdid(config)
  if (!udid) return runFailure('', bundleId, 'resolve-simulator', `no available simulator matching ${config.simulator}`)
  const env = developerEnv(config)
  yield* simctl.run('xcrun', ['simctl', 'boot', udid], {env})
  const booted = yield* simctl.run('xcrun', ['simctl', 'bootstatus', udid, '-b'], {env})
  if (booted.code !== 0) return runFailure(udid, bundleId, 'boot', commandError(booted, 'simulator failed to boot'))
  const artifact = yield* resolveAppPath(runtime)
  if (!artifact.ok) return runFailure(udid, bundleId, 'artifact', artifact.error)
  const installed = yield* simctl.run('xcrun', ['simctl', 'install', udid, artifact.appPath], {env})
  if (installed.code !== 0) {
    const error = commandError(installed, `simctl install failed for ${artifact.appPath}`)
    return runFailure(udid, bundleId, 'install', error)
  }
  yield* simctl.run('xcrun', ['simctl', 'terminate', udid, bundleId], {env})
  const launched = yield* simctl.run('xcrun', ['simctl', 'launch', udid, bundleId], {
    env: launchEnv(runtime, input.autoshow ?? false),
  })
  if (launched.code !== 0) {
    return runFailure(udid, bundleId, 'launch', commandError(launched, `simctl launch failed for ${bundleId}`))
  }
  const pid = parseLaunchedPid(launched)
  const success: Run = pid === undefined ? {ok: true, udid, bundleId} : {ok: true, udid, bundleId, pid}
  return success
})

function pngDimensions(png: Buffer): {width: number; height: number} {
  if (png.length < 24) return {width: 0, height: 0}
  return {width: png.readUInt32BE(16), height: png.readUInt32BE(20)}
}

export const screenshot = Effect.fn('IosSimulator.screenshot')(function* (runtime: IosRuntime) {
  const simctl = yield* Simctl.Service
  const config = runtime.config
  const udid = yield* resolveUdid(config)
  const failed = (error: string): Screenshot => ({output: {ok: false, error}, content: []})
  if (!udid) return failed('no matching simulator for ios_screenshot')
  const shot = yield* simctl.run('xcrun', ['simctl', 'io', udid, 'screenshot', '--type', 'png', '-'], {
    env: developerEnv(config),
  })
  if (shot.code !== 0) return failed(shot.stderr.trim() || 'ios_screenshot failed')
  const image: Tool.FileContent = {
    type: 'file',
    uri: `data:image/png;base64,${shot.stdout.toString('base64')}`,
    mime: 'image/png',
  }
  const captured: Screenshot = {output: {ok: true, ...pngDimensions(shot.stdout)}, content: [image]}
  return captured
})

export const logs = Effect.fn('IosSimulator.logs')(function* (
  runtime: IosRuntime,
  input: {sinceSeconds?: number | undefined; predicate?: string | undefined; limit?: number | undefined},
) {
  const simctl = yield* Simctl.Service
  const config = runtime.config
  const udid = yield* resolveUdid(config)
  if (!udid) {
    const missing: Logs = {ok: false, lines: [], error: 'no matching simulator for ios_logs'}
    return missing
  }
  const args = [
    'simctl',
    'spawn',
    udid,
    'log',
    'show',
    '--style',
    'compact',
    '--last',
    `${input.sinceSeconds ?? DEFAULT_LOG_SECONDS}s`,
    ...(input.predicate ? ['--predicate', input.predicate] : []),
  ]
  const logged = yield* simctl.run('xcrun', args, {env: developerEnv(config)})
  if (logged.code !== 0) {
    const failure: Logs = {ok: false, lines: [], error: boundedCommandError(logged, 'log show failed')}
    return failure
  }
  const lines = stdoutText(logged)
    .split('\n')
    .filter((line) => line.length > 0)
  const limit = input.limit && input.limit > 0 ? input.limit : DEFAULT_LOG_LINES
  const success: Logs = {ok: true, lines: lines.slice(-limit)}
  return success
})
