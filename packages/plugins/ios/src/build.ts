import {join} from 'node:path'
import {Clock, Effect, FileSystem, Option, Path, Schema, Semaphore, type PlatformError} from 'effect'
import {uniq, uniqBy} from 'es-toolkit'
import {z} from 'zod'
import {iosErrors} from './errors/errors.js'
import {
  destination,
  developerEnv,
  moduleName,
  NotConfiguredSchema,
  projectDir,
  type IosConfig,
  type IosRuntime,
} from './config.js'
import {Simctl, boundedCommandError, stdoutText} from './simctl.js'

const DiagnosticSchema = z.object({
  file: z.string(),
  line: z.number(),
  message: z.string(),
  severity: z.enum(['error', 'warning']),
})

type Diagnostic = z.infer<typeof DiagnosticSchema>

const DIAGNOSTIC_LINE = /^(.*?):(\d+):(?:\d+): (error|warning): (.*)$/

function parseDiagnosticLine(raw: string): Diagnostic | null {
  const match = DIAGNOSTIC_LINE.exec(raw)
  if (!match) return null
  const [, file, line, severity, message] = match
  if (file === undefined || line === undefined || severity === undefined || message === undefined) return null
  return {file, line: Number(line), message, severity: severity === 'warning' ? 'warning' : 'error'}
}

function diagnosticKey(diagnostic: Diagnostic): string {
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.severity}:${diagnostic.message}`
}

function parseDiagnostics(output: string): Diagnostic[] {
  const parsed = output.split('\n').flatMap((raw) => parseDiagnosticLine(raw) ?? [])
  return uniqBy(parsed, diagnosticKey)
}

export const BuildOutputSchema = z.union([
  z.object({
    ok: z.boolean(),
    appPath: z.string().nullable(),
    durationMs: z.number(),
    diagnostics: z.array(DiagnosticSchema),
  }),
  NotConfiguredSchema,
])

type Build = {ok: boolean; appPath: string | null; durationMs: number; diagnostics: Diagnostic[]}

function fileFailure(message: string) {
  return <Value, Requirements>(effect: Effect.Effect<Value, PlatformError.PlatformError, Requirements>) =>
    effect.pipe(Effect.mapError((cause) => iosErrors.BUILD_FILE_FAILED({detail: message, cause})))
}

const collectSwiftSources = Effect.fn('ios.build.collectSwiftSources')(function* (
  root: string,
  extraSourceDirs: readonly string[],
) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const roots = [path.join(root, 'Sources'), ...extraSourceDirs.map((dir) => path.resolve(root, dir))]
  const files = yield* Effect.forEach(
    roots,
    (dir) =>
      Effect.gen(function* () {
        if (!(yield* fileSystem.exists(dir))) return []
        const entries = yield* fileSystem.readDirectory(dir, {recursive: true})
        const swiftNamed = entries.filter((entry) => entry.endsWith('.swift')).map((entry) => path.join(dir, entry))
        return yield* Effect.filter(
          swiftNamed,
          (candidate) => fileSystem.stat(candidate).pipe(Effect.map((info) => info.type === 'File')),
          {concurrency: 8},
        )
      }),
    {concurrency: 8},
  )
  return uniq(files.flat()).toSorted()
})

const SWIFT_CPUS: Record<string, string> = {arm64: 'arm64', x64: 'x86_64'}

const SWIFT_TARGET = `${SWIFT_CPUS[process.arch] ?? process.arch}-apple-ios17.0-simulator`

const BuildSettingsEntrySchema = Schema.Struct({
  buildSettings: Schema.Struct({
    PRODUCT_BUNDLE_IDENTIFIER: Schema.optionalKey(Schema.String),
    TARGET_BUILD_DIR: Schema.optionalKey(Schema.String),
    WRAPPER_NAME: Schema.optionalKey(Schema.String),
  }),
})

const decodeBuildSettings = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.Unknown)))

const decodeBuildSettingsEntry = Schema.decodeUnknownOption(BuildSettingsEntrySchema)

function appTargetPath(entry: unknown, bundleId: string): string | null {
  const decoded = decodeBuildSettingsEntry(entry)
  if (Option.isNone(decoded)) return null
  const settings = decoded.value.buildSettings
  if (settings.PRODUCT_BUNDLE_IDENTIFIER !== bundleId) return null
  const dir = settings.TARGET_BUILD_DIR
  const wrapper = settings.WRAPPER_NAME
  if (dir === undefined || wrapper === undefined || !wrapper.endsWith('.app')) return null
  return join(dir, wrapper)
}

export function parseXcodebuildAppPath(text: string, bundleId: string): string | null {
  const entries = decodeBuildSettings(text)
  if (Option.isNone(entries)) return null
  return entries.value.map((entry) => appTargetPath(entry, bundleId)).find((path) => path !== null) ?? null
}

function schemeArgs(config: IosConfig): string[] {
  return config.scheme ? ['-scheme', config.scheme] : []
}

export const resolveXcodebuildAppPath = Effect.fn('ios.build.resolveXcodebuildAppPath')(function* (
  runtime: IosRuntime,
) {
  const simctl = yield* Simctl.Service
  const config = runtime.config
  const settings = yield* simctl.run(
    'xcrun',
    ['xcodebuild', ...schemeArgs(config), '-destination', destination(config), '-showBuildSettings', '-json'],
    {cwd: projectDir(config, runtime.cwd), env: developerEnv(config)},
  )
  if (settings.code !== 0) return null
  return parseXcodebuildAppPath(stdoutText(settings), config.bundleId)
})

function commandDiagnostic(result: Simctl.RunResult, fallback: string): Diagnostic {
  return {file: '', line: 0, severity: 'error', message: boundedCommandError(result, fallback)}
}

function reportedDiagnostics(
  diagnostics: Diagnostic[],
  ok: boolean,
  result: Simctl.RunResult,
  fallback: string,
): Diagnostic[] {
  if (ok || diagnostics.length > 0) return diagnostics
  return [commandDiagnostic(result, fallback)]
}

function commandFailureDiagnostics(result: Simctl.RunResult, fallback: string): Diagnostic[] {
  return reportedDiagnostics(parseDiagnostics(`${stdoutText(result)}\n${result.stderr}`), false, result, fallback)
}

function missingPlistDiagnostic(path: string): Diagnostic {
  return {
    file: path,
    line: 0,
    severity: 'error',
    message: 'Info.plist not found: swiftc mode cannot assemble an installable .app bundle without it',
  }
}

const buildXcodebuild = Effect.fn('ios.build.xcodebuild')(function* (runtime: IosRuntime, clean: boolean) {
  const simctl = yield* Simctl.Service
  const config = runtime.config
  const actions = clean ? ['clean', 'build'] : ['build']
  const started = yield* Clock.currentTimeMillis
  const result = yield* simctl.run(
    'xcrun',
    ['xcodebuild', ...schemeArgs(config), '-destination', destination(config), ...actions],
    {cwd: projectDir(config, runtime.cwd), env: developerEnv(config)},
  )
  const durationMs = (yield* Clock.currentTimeMillis) - started
  const ok = result.code === 0
  const parsed = parseDiagnostics(`${stdoutText(result)}\n${result.stderr}`)
  const diagnostics = reportedDiagnostics(parsed, ok, result, 'xcodebuild failed')
  const appPath = ok ? yield* resolveXcodebuildAppPath(runtime) : null
  const built: Build = {ok, appPath, durationMs, diagnostics}
  return built
})

const buildSwiftc = Effect.fn('ios.build.swiftc')(function* (runtime: IosRuntime, clean: boolean) {
  const simctl = yield* Simctl.Service
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const config = runtime.config
  const root = projectDir(config, runtime.cwd)
  const env = developerEnv(config)
  const module = moduleName(config)
  const appDir = path.join(root, 'build', `${module}.app`)
  const started = yield* Clock.currentTimeMillis
  const finished = (ok: boolean, appPath: string | null, diagnostics: Diagnostic[]) =>
    Effect.map(Clock.currentTimeMillis, (now): Build => ({ok, appPath, durationMs: now - started, diagnostics}))
  const failed = (diagnostics: Diagnostic[]) => finished(false, null, diagnostics)

  if (clean) {
    yield* fileSystem.remove(appDir, {recursive: true, force: true}).pipe(fileFailure(`could not remove ${appDir}`))
  }

  const sdk = yield* simctl.run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], {cwd: root, env})
  if (sdk.code !== 0) return yield* failed(commandFailureDiagnostics(sdk, 'xcrun --show-sdk-path failed'))
  const sdkPath = stdoutText(sdk).trim()
  const sources = yield* collectSwiftSources(root, config.extraSourceDirs ?? []).pipe(
    fileFailure(`could not read the swift sources under ${root}`),
  )
  yield* fileSystem.makeDirectory(appDir, {recursive: true}).pipe(fileFailure(`could not create ${appDir}`))

  const compile = yield* simctl.run(
    'xcrun',
    [
      '--sdk',
      'iphonesimulator',
      'swiftc',
      '-sdk',
      sdkPath,
      '-target',
      SWIFT_TARGET,
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
      path.join(appDir, module),
      ...sources,
    ],
    {cwd: root, env},
  )
  const diagnostics = parseDiagnostics(`${stdoutText(compile)}\n${compile.stderr}`)
  if (compile.code !== 0) return yield* failed(commandFailureDiagnostics(compile, 'swiftc failed'))

  const infoPlist = path.join(root, 'Info.plist')
  const plistExists = yield* fileSystem.exists(infoPlist).pipe(fileFailure(`could not read ${infoPlist}`))
  if (!plistExists) return yield* failed([...diagnostics, missingPlistDiagnostic(infoPlist)])
  const plist = yield* simctl.run('plutil', ['-convert', 'binary1', '-o', path.join(appDir, 'Info.plist'), infoPlist], {
    cwd: root,
    env,
  })
  if (plist.code !== 0) return yield* failed(commandFailureDiagnostics(plist, 'plutil failed to convert Info.plist'))
  const pkgInfo = path.join(appDir, 'PkgInfo')
  yield* fileSystem.writeFileString(pkgInfo, 'APPL????').pipe(fileFailure(`could not write ${pkgInfo}`))
  const signed = yield* simctl.run('codesign', ['--force', '--sign', '-', '--timestamp=none', appDir], {
    cwd: root,
    env,
  })
  if (signed.code !== 0) return yield* failed(commandFailureDiagnostics(signed, 'codesign failed'))
  return yield* finished(true, appDir, diagnostics)
})

function build(runtime: IosRuntime, input: {clean?: boolean | undefined}) {
  const clean = input.clean ?? false
  if (runtime.config.buildMode === 'swiftc') return buildSwiftc(runtime, clean)
  return buildXcodebuild(runtime, clean)
}

export const makeBuild = Effect.map(
  Semaphore.make(1),
  (permit) => (runtime: IosRuntime, input: {clean?: boolean | undefined}) =>
    permit.withPermits(1)(build(runtime, input)),
)
