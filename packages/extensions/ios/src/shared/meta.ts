import {z} from 'zod'

export {IOS_NAME} from './name.js'

const DEFAULT_SIMULATOR = 'iPhone 17 Pro'
export const DEFAULT_DEVELOPER_DIR = '/Applications/Xcode.app/Contents/Developer'

const NATIVE_SUFFIX = '/native'

const CONCIV_URL_RULE =
  'concivUrl must be the core api base with no page path (an optional /t/<token> prefix is allowed): the swift sdk appends /native itself, see packages/extensions/ios/README.md'

function withoutTrailingSlashes(raw: string): string {
  return raw.replace(/\/+$/, '')
}

function stripNativeSuffix(raw: string): string {
  const trimmed = withoutTrailingSlashes(raw)
  return trimmed.endsWith(NATIVE_SUFFIX) ? withoutTrailingSlashes(trimmed.slice(0, -NATIVE_SUFFIX.length)) : trimmed
}

function isBareApiBase(raw: string): boolean {
  try {
    return /^(\/t\/[^/]+)?$/.test(withoutTrailingSlashes(new URL(raw).pathname))
  } catch {
    return false
  }
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

export const IosConfigSchema = z.preprocess(emptyToUndefined, FullIosConfigSchema.optional())

export type IosConfig = z.infer<typeof FullIosConfigSchema>
