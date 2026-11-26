import {join} from 'node:path'
import {Schema} from 'effect'
import {z} from 'zod'

const DEFAULT_SIMULATOR = 'iPhone 17 Pro'
const DEFAULT_DEVELOPER_DIR = '/Applications/Xcode.app/Contents/Developer'

const WIDGET_SUFFIX = '/widget'

const CONCIV_URL_RULE =
  'concivUrl must be the engine api base with no path: the swift sdk appends /widget itself, see packages/plugins/ios/README.md'

function withoutTrailingSlashes(raw: string): string {
  return raw.replace(/\/+$/, '')
}

function stripNativeSuffix(raw: string): string {
  const trimmed = withoutTrailingSlashes(raw)
  return trimmed.endsWith(WIDGET_SUFFIX) ? withoutTrailingSlashes(trimmed.slice(0, -WIDGET_SUFFIX.length)) : trimmed
}

function isBareApiBase(raw: string): boolean {
  return URL.canParse(raw) && withoutTrailingSlashes(new URL(raw).pathname) === ''
}

const ConcivUrlSchema = z.string().url().transform(stripNativeSuffix).refine(isBareApiBase, {message: CONCIV_URL_RULE})

const FullIosConfigSchema = z.object({
  projectRoot: z.string().min(1),
  scheme: z.string().min(1).optional(),
  bundleId: z.string().min(1),
  simulator: z.string().default(DEFAULT_SIMULATOR),
  developerDir: z.string().optional(),
  buildMode: z.enum(['xcodebuild', 'swiftc']).default('xcodebuild'),
  extraSourceDirs: z.array(z.string()).optional(),
  concivUrl: ConcivUrlSchema.optional(),
})

function emptyToUndefined(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0) return undefined
  return raw
}

export const InvalidOptions = Schema.TaggedStruct('InvalidOptions', {message: Schema.String})

export const IosConfigSchema = z.preprocess(emptyToUndefined, FullIosConfigSchema.optional())

export type IosConfig = z.infer<typeof FullIosConfigSchema>

export type IosRuntime = {
  readonly config: IosConfig
  readonly cwd: string
  readonly concivUrl: () => string | undefined
}

export function developerEnv(config: IosConfig): Record<string, string> {
  return {DEVELOPER_DIR: config.developerDir ?? DEFAULT_DEVELOPER_DIR}
}

export function moduleName(config: IosConfig): string {
  if (config.scheme) return config.scheme
  const tail = config.bundleId.split('.').at(-1) ?? config.bundleId
  return tail.replace(/[^A-Za-z0-9_]/g, '')
}

export function projectDir(config: IosConfig, cwd: string): string {
  return config.projectRoot.startsWith('/') ? config.projectRoot : join(cwd, config.projectRoot)
}

export function destination(config: IosConfig): string {
  return `platform=iOS Simulator,name=${config.simulator}`
}

export const NotConfiguredSchema = z.object({ok: z.literal(false), error: z.string()})

export type NotConfigured = z.infer<typeof NotConfiguredSchema>
