import {Effect, FileSystem, Option, Path, Schema} from 'effect'
import {resolveXcodebuildAppPath} from './build.js'
import {developerEnv, moduleName, projectDir, type IosConfig, type IosRuntime} from './config.js'
import {iosErrors} from './errors/errors.js'
import {Simctl, boundedCommandError, commandError, stdoutText} from './simctl.js'

const DEFAULT_LOG_LINES = 500

const DEFAULT_LOG_SECONDS = 60

const SimDeviceSchema = Schema.Struct({
  udid: Schema.String,
  name: Schema.String,
  state: Schema.optionalKey(Schema.String),
  isAvailable: Schema.optionalKey(Schema.Boolean),
})

type SimDevice = typeof SimDeviceSchema.Type

const decodeDeviceGroups = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({devices: Schema.Record(Schema.String, Schema.Unknown)})),
)

const decodeDeviceGroup = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))

const decodeDevice = Schema.decodeUnknownOption(SimDeviceSchema)

function parseSimDevices(text: string): SimDevice[] {
  const groups = decodeDeviceGroups(text)
  if (Option.isNone(groups)) return []
  return Object.values(groups.value.devices).flatMap((group) =>
    Option.getOrElse(decodeDeviceGroup(group), () => []).flatMap((entry) => Option.toArray(decodeDevice(entry))),
  )
}

const resolveUdid = Effect.fn('ios.simulator.resolveUdid')(function* (config: IosConfig) {
  const simctl = yield* Simctl.Service
  const listed = yield* simctl.run('xcrun', ['simctl', 'list', '-j', 'devices'], {env: developerEnv(config)})
  const available =
    listed.code === 0 ? parseSimDevices(stdoutText(listed)).filter((device) => device.isAvailable !== false) : []
  const matches = available.filter((device) => device.udid === config.simulator || device.name === config.simulator)
  const booted = matches.find((device) => device.state === 'Booted')
  const udid = (booted ?? matches[0])?.udid
  if (udid === undefined) return yield* Effect.fail(iosErrors.SIMULATOR_NOT_FOUND({simulator: config.simulator}))
  return udid
})

function missingArtifact(udid: string, appPath: string, mode: IosConfig['buildMode']) {
  return iosErrors.ARTIFACT_MISSING({
    detail: `no built .app at ${appPath} (${mode} build mode): run ios_build before ios_run`,
    internal: {udid},
  })
}

const existingArtifact = Effect.fn('ios.simulator.existingArtifact')(function* (
  udid: string,
  appPath: string,
  mode: IosConfig['buildMode'],
) {
  const fileSystem = yield* FileSystem.FileSystem
  const exists = yield* fileSystem
    .exists(appPath)
    .pipe(Effect.catchTag('PlatformError', () => Effect.fail(missingArtifact(udid, appPath, mode))))
  if (!exists) return yield* Effect.fail(missingArtifact(udid, appPath, mode))
  return appPath
})

const resolveAppPath = Effect.fn('ios.simulator.resolveAppPath')(function* (runtime: IosRuntime, udid: string) {
  const path = yield* Path.Path
  const config = runtime.config
  if (config.buildMode === 'swiftc') {
    const appPath = path.join(projectDir(config, runtime.cwd), 'build', `${moduleName(config)}.app`)
    return yield* existingArtifact(udid, appPath, 'swiftc')
  }
  const resolved = yield* resolveXcodebuildAppPath(runtime)
  if (resolved === null) {
    return yield* Effect.fail(
      iosErrors.ARTIFACT_MISSING({
        detail: 'no built .app found in the xcodebuild settings: run ios_build before ios_run',
        internal: {udid},
      }),
    )
  }
  return yield* existingArtifact(udid, resolved, 'xcodebuild')
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

export const launch = Effect.fn('ios.simulator.launch')(function* (
  runtime: IosRuntime,
  input: {autoshow?: boolean | undefined},
) {
  const simctl = yield* Simctl.Service
  const config = runtime.config
  const bundleId = config.bundleId
  const udid = yield* resolveUdid(config)
  const env = developerEnv(config)
  yield* simctl.run('xcrun', ['simctl', 'boot', udid], {env})
  const booted = yield* simctl.run('xcrun', ['simctl', 'bootstatus', udid, '-b'], {env})
  if (booted.code !== 0) {
    return yield* Effect.fail(
      iosErrors.BOOT_FAILED({detail: commandError(booted, 'simulator failed to boot'), internal: {udid}}),
    )
  }
  const appPath = yield* resolveAppPath(runtime, udid)
  const installed = yield* simctl.run('xcrun', ['simctl', 'install', udid, appPath], {env})
  if (installed.code !== 0) {
    return yield* Effect.fail(
      iosErrors.INSTALL_FAILED({
        detail: commandError(installed, `simctl install failed for ${appPath}`),
        internal: {udid},
      }),
    )
  }
  yield* simctl.run('xcrun', ['simctl', 'terminate', udid, bundleId], {env})
  const launched = yield* simctl.run('xcrun', ['simctl', 'launch', udid, bundleId], {
    env: launchEnv(runtime, input.autoshow ?? false),
  })
  if (launched.code !== 0) {
    return yield* Effect.fail(
      iosErrors.LAUNCH_FAILED({
        detail: commandError(launched, `simctl launch failed for ${bundleId}`),
        internal: {udid},
      }),
    )
  }
  return {udid, pid: parseLaunchedPid(launched)}
})

function pngDimensions(png: Uint8Array): {width: number; height: number} {
  if (png.length < 24) return {width: 0, height: 0}
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return {width: view.getUint32(16), height: view.getUint32(20)}
}

export const capture = Effect.fn('ios.simulator.capture')(function* (config: IosConfig) {
  const simctl = yield* Simctl.Service
  const udid = yield* resolveUdid(config)
  const shot = yield* simctl.run('xcrun', ['simctl', 'io', udid, 'screenshot', '--type', 'png', '-'], {
    env: developerEnv(config),
  })
  if (shot.code !== 0)
    return yield* Effect.fail(iosErrors.SCREENSHOT_FAILED({detail: shot.stderr.trim() || 'ios_screenshot failed'}))
  return {png: shot.stdout, ...pngDimensions(shot.stdout)}
})

export const readLogs = Effect.fn('ios.simulator.readLogs')(function* (
  config: IosConfig,
  input: {sinceSeconds?: number | undefined; predicate?: string | undefined; limit?: number | undefined},
) {
  const simctl = yield* Simctl.Service
  const udid = yield* resolveUdid(config)
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
  if (logged.code !== 0)
    return yield* Effect.fail(iosErrors.LOGS_FAILED({detail: boundedCommandError(logged, 'log show failed')}))
  const lines = stdoutText(logged)
    .split('\n')
    .filter((line) => line.length > 0)
  const limit = input.limit && input.limit > 0 ? input.limit : DEFAULT_LOG_LINES
  return lines.slice(-limit)
})
