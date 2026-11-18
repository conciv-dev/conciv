import {arch} from 'node:os'
import {existsSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {Effect} from 'effect'
import {z} from 'zod'
import type {Tool} from '@conciv/plugin/schema/tool'
import type {IosConfig} from './config.js'
import {DiagnosticSchema, parseDiagnostics, type Diagnostic} from './diagnostics.js'
import {
  boundedCommandError,
  destination,
  developerEnv,
  fileStep,
  isRecord,
  moduleName,
  NotConfiguredSchema,
  projectDir,
  safeJson,
  stdoutText,
  type IosRuntime,
} from './shared.js'
import * as Simctl from './simctl.js'

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

type BuildEffect = Effect.Effect<Build, Tool.Error, Simctl.Interface>

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

function collectSwiftSources(root: string, extraSourceDirs: readonly string[]): string[] {
  const roots = [join(root, 'Sources'), ...extraSourceDirs.map((dir) => resolveSourceRoot(root, dir))]
  const files = roots.filter((dir) => existsSync(dir)).flatMap(walkSwiftSources)
  return [...new Set(files)].toSorted()
}

function swiftTarget(): string {
  const cpus: Record<string, string> = {arm64: 'arm64', x64: 'x86_64'}
  const cpu = cpus[arch()] ?? arch()
  return `${cpu}-apple-ios17.0-simulator`
}

function stringField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
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

function schemeArgs(config: IosConfig): string[] {
  return config.scheme ? ['-scheme', config.scheme] : []
}

export const resolveXcodebuildAppPath = Effect.fn('IosBuild.resolveXcodebuildAppPath')(function* (runtime: IosRuntime) {
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

const buildXcodebuild = Effect.fn('IosBuild.xcodebuild')(function* (runtime: IosRuntime, clean: boolean) {
  const simctl = yield* Simctl.Service
  const config = runtime.config
  const actions = clean ? ['clean', 'build'] : ['build']
  const started = Date.now()
  const result = yield* simctl.run(
    'xcrun',
    ['xcodebuild', ...schemeArgs(config), '-destination', destination(config), ...actions],
    {cwd: projectDir(config, runtime.cwd), env: developerEnv(config)},
  )
  const durationMs = Date.now() - started
  const ok = result.code === 0
  const parsed = parseDiagnostics(`${stdoutText(result)}\n${result.stderr}`)
  const diagnostics = reportedDiagnostics(parsed, ok, result, 'xcodebuild failed')
  const appPath = ok ? yield* resolveXcodebuildAppPath(runtime) : null
  return {ok, appPath, durationMs, diagnostics}
})

const buildSwiftc = Effect.fn('IosBuild.swiftc')(function* (runtime: IosRuntime, clean: boolean) {
  const simctl = yield* Simctl.Service
  const config = runtime.config
  const root = projectDir(config, runtime.cwd)
  const env = developerEnv(config)
  const module = moduleName(config)
  const appDir = join(root, 'build', `${module}.app`)
  const started = Date.now()
  const failed = (diagnostics: Diagnostic[]): Build => ({
    ok: false,
    appPath: null,
    durationMs: Date.now() - started,
    diagnostics,
  })

  if (clean) yield* fileStep(`could not remove ${appDir}`, () => rmSync(appDir, {recursive: true, force: true}))

  const sdk = yield* simctl.run('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], {cwd: root, env})
  if (sdk.code !== 0) return failed(commandFailureDiagnostics(sdk, 'xcrun --show-sdk-path failed'))
  const sdkPath = stdoutText(sdk).trim()
  const sources = yield* fileStep(`could not read the swift sources under ${root}`, () =>
    collectSwiftSources(root, config.extraSourceDirs ?? []),
  )
  yield* fileStep(`could not create ${appDir}`, () => mkdirSync(appDir, {recursive: true}))

  const compile = yield* simctl.run(
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
  if (compile.code !== 0) return failed(commandFailureDiagnostics(compile, 'swiftc failed'))

  const infoPlist = join(root, 'Info.plist')
  if (!existsSync(infoPlist)) return failed([...diagnostics, missingPlistDiagnostic(infoPlist)])
  const plist = yield* simctl.run('plutil', ['-convert', 'binary1', '-o', join(appDir, 'Info.plist'), infoPlist], {
    cwd: root,
    env,
  })
  if (plist.code !== 0) return failed(commandFailureDiagnostics(plist, 'plutil failed to convert Info.plist'))
  yield* fileStep(`could not write ${join(appDir, 'PkgInfo')}`, () =>
    writeFileSync(join(appDir, 'PkgInfo'), 'APPL????'),
  )
  const signed = yield* simctl.run('codesign', ['--force', '--sign', '-', '--timestamp=none', appDir], {
    cwd: root,
    env,
  })
  if (signed.code !== 0) return failed(commandFailureDiagnostics(signed, 'codesign failed'))
  return {ok: true, appPath: appDir, durationMs: Date.now() - started, diagnostics}
})

export function build(runtime: IosRuntime, input: {clean?: boolean | undefined}): BuildEffect {
  const clean = input.clean ?? false
  if (runtime.config.buildMode === 'swiftc') return buildSwiftc(runtime, clean)
  return buildXcodebuild(runtime, clean)
}
