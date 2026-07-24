import {z} from 'zod'

export {IOS_NAME} from './name.js'

export const DEFAULT_SIMULATOR = 'iPhone 17 Pro'
export const DEFAULT_DEVELOPER_DIR = '/Applications/Xcode.app/Contents/Developer'

const FullIosConfigSchema = z.object({
  projectRoot: z.string().min(1),
  scheme: z.string().min(1).optional(),
  bundleId: z.string().min(1),
  simulator: z.string().default(DEFAULT_SIMULATOR),
  developerDir: z.string().optional(),
  buildMode: z.enum(['xcodebuild', 'swiftc']).default('xcodebuild'),
})

function emptyToUndefined(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 0) return undefined
  return raw
}

export const IosConfigSchema = z.preprocess(emptyToUndefined, FullIosConfigSchema.optional())

export type IosConfig = z.infer<typeof FullIosConfigSchema>

export const IOS_SYSTEM_PROMPT = [
  'You can build and drive an iOS simulator app through the ios.* tools instead of raw bash.',
  'Tools: ios.build (compile the native project), ios.run (boot the simulator, install, and launch),',
  'ios.screenshot (capture the current simulator screen as an image), ios.logs (recent device logs).',
  'There is no ios.viewHierarchy tool. To understand what is on screen, call ios.screenshot for the',
  'pixels, and rely on a grabbed view: its picked text plus a folded view subtree arrive inside the',
  'grab text you receive, and its source names the view class.',
  'Locate a view class in the project by grep: a class name like PaymentCardCell maps to a Swift file,',
  'so run a grep for "class PaymentCardCell" under the project root to find and edit it.',
  'After you edit Swift, verify with the loop: ios.build, then ios.run, then ios.screenshot.',
  'SwiftUI views are only pickable when the developer anchors them with the .concivGrab(id:) modifier.',
  'Unanchored SwiftUI content is not pickable, so if a grab returns nothing there, ask the developer to',
  'add a .concivGrab(id:) anchor rather than assuming the view is missing.',
].join(' ')
