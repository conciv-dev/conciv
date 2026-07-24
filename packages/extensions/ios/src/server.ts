import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {IOS_NAME, IOS_SYSTEM_PROMPT, IosConfigSchema} from './shared/meta.js'
import {makeExecRunner} from './server/simctl-runner.js'
import {runBuild, runLogs, runRun, runScreenshot, type IosToolContext} from './server/tools.js'

const BuildInput = z.object({clean: z.boolean().optional()})
const RunInput = z.object({autoshow: z.boolean().optional()})
const ScreenshotInput = z.object({})
const LogsInput = z.object({
  sinceSeconds: z.number().int().positive().optional(),
  predicate: z.string().optional(),
  limit: z.number().int().positive().optional(),
})

const buildTool = defineTool<typeof BuildInput, IosToolContext>({
  name: 'ios.build',
  description: 'Compile the native iOS project for the simulator and report build diagnostics.',
  inputSchema: BuildInput,
  approval: 'ask',
  streamTitle: 'Building iOS app',
}).server((input, ctx) => runBuild(ctx, input))

const runTool = defineTool<typeof RunInput, IosToolContext>({
  name: 'ios.run',
  description: 'Boot the simulator, install the built app, and launch it so the change is visible.',
  inputSchema: RunInput,
  approval: 'ask',
  streamTitle: 'Launching iOS app',
}).server((input, ctx) => runRun(ctx, input))

const screenshotTool = defineTool<typeof ScreenshotInput, IosToolContext>({
  name: 'ios.screenshot',
  description: 'Capture the current simulator screen as a PNG image to verify what is on screen.',
  inputSchema: ScreenshotInput,
}).server((_input, ctx) => runScreenshot(ctx))

const logsTool = defineTool<typeof LogsInput, IosToolContext>({
  name: 'ios.logs',
  description: 'Return recent simulator log lines, optionally filtered by a log predicate.',
  inputSchema: LogsInput,
}).server((input, ctx) => runLogs(ctx, input))

export default defineExtension({
  name: IOS_NAME,
  configSchema: IosConfigSchema,
  tools: [buildTool, runTool, screenshotTool, logsTool],
  systemPrompt: IOS_SYSTEM_PROMPT,
}).server((server) => ({
  context: {config: server.config, runner: makeExecRunner(), cwd: server.cwd, concivUrl: process.env.CONCIV_URL},
}))
