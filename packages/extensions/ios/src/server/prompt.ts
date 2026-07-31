import type {ExtensionPromptContext} from '@conciv/extension'
import type {IosConfig} from '../shared/meta.js'
import {projectDir} from './tools.js'

const OVERLAY_RULES = [
  'You are running as an overlay inside a native iOS app on the simulator, not on a web page.',
  'The conciv widget is a transparent WebView layered above the native UIKit and SwiftUI screens the',
  'app renders. When the user talks about "this page", "this screen", "the layout", or "the view", they',
  'mean the NATIVE app screen underneath the overlay, not the web document that hosts the widget.',
  'The web page snapshot shows only the empty transparent host document, so never use a page snapshot',
  'to inspect what is on screen: it tells you nothing about the native UI. To see the screen, call',
  'ios.screenshot for the actual pixels.',
  'There is no dev server and no hot reload here: a Swift edit reaches the screen only after ios.build',
  'and then ios.run, so end every change with that loop and confirm it with ios.screenshot.',
  'You can build and drive the app through the ios.* tools instead of raw bash.',
  'Tools: ios.build (compile the native project), ios.run (boot the simulator, install, and launch),',
  'ios.screenshot (capture the current simulator screen as an image), ios.logs (recent device logs).',
  'There is no ios.viewHierarchy tool. To understand what is on screen, call ios.screenshot for the',
  'pixels, and rely on a grabbed view: its picked text plus a folded view subtree arrive inside the',
  'grab text you receive, and its source names the view class.',
  'SwiftUI views are only pickable when the developer anchors them with the .concivGrab(id:) modifier.',
  'Unanchored SwiftUI content is not pickable, so if a grab returns nothing there, ask the developer to',
  'add a .concivGrab(id:) anchor rather than assuming the view is missing.',
].join(' ')

function schemePhrase(config: IosConfig): string {
  return config.scheme ? `scheme ${config.scheme}` : 'the default scheme'
}

function extraSourcePhrase(config: IosConfig): string {
  const sourceDirectories = config.extraSourceDirs ?? []
  if (sourceDirectories.length === 0) return ''
  return ` Extra Swift sources for this app also live in ${sourceDirectories.join(', ')} (relative to the project root).`
}

function groundingRules(config: IosConfig, context: ExtensionPromptContext): string {
  const root = projectDir(config, context.cwd)
  return [
    `This session serves exactly one app: the iOS project at ${root}, bundle id ${config.bundleId}, built`,
    `in ${config.buildMode} mode with ${schemePhrase(config)} for the ${config.simulator} simulator.`,
    `Your working directory is ${context.cwd}, and every file you may read or change is under it.${extraSourcePhrase(config)}`,
    'The native project is a Swift source tree: view classes and accessibility identifiers map to Swift',
    `files, so a class named PaymentCardCell is found with grep -rn "class PaymentCardCell" ${root}.`,
    'Never search from the filesystem root. find /, ls /, grep -r / and any scan outside your working',
    'directory only reach simulator runtimes, the Xcode toolchain, and system caches: gigabytes of files',
    'you cannot edit and the user never asked about. Scope every search to the paths named above.',
  ].join(' ')
}

export function iosSystemPrompt(config: IosConfig, context: ExtensionPromptContext): string {
  return `${OVERLAY_RULES} ${groundingRules(config, context)}`
}
