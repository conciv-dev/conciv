import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {IOS_NAME, IosConfigSchema} from './shared/meta.js'
import {iosSystemPrompt} from './server/prompt.js'
import {makeExecRunner} from './server/simctl-runner.js'
import {
  BuildOutputSchema,
  LogsOutputSchema,
  RunOutputSchema,
  ScreenshotOutputSchema,
  runBuild,
  runLogs,
  runRun,
  runScreenshot,
  type IosToolContext,
} from './server/tools.js'

const IOS_CATEGORY = 'ios'

const BuildInput = z.object({clean: z.boolean().optional()})
const RunInput = z.object({autoshow: z.boolean().optional()})
const ScreenshotInput = z.object({})
const LogsInput = z.object({
  sinceSeconds: z.number().int().positive().max(3600).optional(),
  predicate: z.string().max(2000).optional(),
  limit: z.number().int().positive().max(5000).optional(),
})

const buildTool = defineTool({
  name: 'ios_build',
  description: 'Compile the native iOS project for the simulator and report build diagnostics.',
  inputSchema: BuildInput,
  outputSchema: BuildOutputSchema,
  approval: 'ask',
  streamTitle: 'Building iOS app',
  meta: {
    summary: 'compile the native iOS project for the simulator',
    category: IOS_CATEGORY,
    mutating: true,
    keywords: ['ios', 'build', 'compile', 'xcode'],
    icon: 'script',
    label: {running: 'Building the iOS app', done: 'Built the iOS app'},
    hint: 'answers with ok false and an error field when the extension carries no ios config',
  },
}).server((input, ctx: IosToolContext) => runBuild(ctx, input))

const runTool = defineTool({
  name: 'ios_run',
  description: 'Boot the simulator, install the built app, and launch it so the change is visible.',
  inputSchema: RunInput,
  outputSchema: RunOutputSchema,
  approval: 'ask',
  streamTitle: 'Launching iOS app',
  meta: {
    summary: 'boot the simulator, install the built app, and launch it',
    category: IOS_CATEGORY,
    mutating: true,
    keywords: ['ios', 'run', 'simulator', 'launch'],
    icon: 'script',
    label: {running: 'Launching the iOS app', done: 'Launched the iOS app'},
    hint: 'needs a built app; a failure names the stage it stopped at',
  },
}).server((input, ctx: IosToolContext) => runRun(ctx, input))

const screenshotTool = defineTool({
  name: 'ios_screenshot',
  description: 'Capture the current simulator screen as a PNG image to verify what is on screen.',
  inputSchema: ScreenshotInput,
  outputSchema: ScreenshotOutputSchema,
  meta: {
    summary: 'capture the current simulator screen as a png image',
    category: IOS_CATEGORY,
    mutating: false,
    keywords: ['ios', 'screenshot', 'screen', 'image'],
    icon: 'read',
    label: {running: 'Capturing the screen', done: 'Captured the screen'},
    hint: 'returns an image part plus a text part carrying the png width and height',
  },
}).server((_input, ctx: IosToolContext) => runScreenshot(ctx))

const logsTool = defineTool({
  name: 'ios_logs',
  description: 'Return recent simulator log lines, optionally filtered by a log predicate.',
  inputSchema: LogsInput,
  outputSchema: LogsOutputSchema,
  meta: {
    summary: 'return recent simulator log lines',
    category: IOS_CATEGORY,
    mutating: false,
    keywords: ['ios', 'logs', 'simulator'],
    icon: 'read',
    label: {running: 'Reading simulator logs', done: 'Read simulator logs'},
    hint: 'narrow the output with a log predicate and a seconds window',
  },
}).server((input, ctx: IosToolContext) => runLogs(ctx, input))

export default defineExtension({
  name: IOS_NAME,
  configSchema: IosConfigSchema,
  tools: [buildTool, runTool, screenshotTool, logsTool],
  systemPrompt: iosSystemPrompt,
}).server((server) => ({
  context: {config: server.config, runner: makeExecRunner(), cwd: server.cwd, nativeUrl: server.nativeUrl},
}))
