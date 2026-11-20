export {until, type UntilOpts} from './until.js'
export {exchangePrintedCode, loginThroughTerminal, requestPrintedCode, type TerminalReader} from './login.js'
export {serveApp, type ServedApp} from './serve-app.js'
export {
  createTestkit,
  type BootApp,
  type BootedApp,
  type BootEnv,
  type ChatMessage,
  type Kit,
  type Testkit,
} from './create-testkit.js'
export {createTestHarness, type TestHarness} from './create-test-harness.js'
export {
  createFakeHarness,
  type FakeHarness,
  type FakeHarnessOptions,
  type FixtureSession,
} from './create-fake-harness.js'
export {
  createScriptedChat,
  type PacedRelease,
  type PacedText,
  type ScriptedChat,
  type ScriptedRun,
  type ScriptedTurn,
  type ScriptedTurnToolCall,
} from './scripted-run.js'
export type {FakeCli, FakeCliCommand, FakeCliScript} from './fake-cli.js'
export {harnessAvailable} from './harness-available.js'
export {
  approvePending,
  makeCallTool,
  makeDiscoverTools,
  makeRunTypescript,
  withAutoApproval,
  type CallTool,
  type DiscoverTools,
  type McpCallOptions,
  type RunTypescript,
} from './call-tool.js'
export {connectMcpClient, type McpClient, type McpContentPart, type McpTool} from './mcp-client.js'
export {makeRpcClient, type RpcClient} from './session.js'
export type {RunStream} from './run-stream.js'
export type {RunEvents, SeenToolCall} from './run-events.js'
import type {HarnessAdapter} from '@conciv/harness'
import {createTestHarness, type TestHarness} from './create-test-harness.js'
import {harnessAvailable} from './harness-available.js'

export type HarnessMode =
  | {name: 'fake'; harness: TestHarness; run: true}
  | {name: 'real'; harness: HarnessAdapter; run: boolean}

function isCI(): boolean {
  return Boolean(process.env.CI)
}

export function harnessModes(real: HarnessAdapter): HarnessMode[] {
  return [
    {name: 'fake', harness: createTestHarness(real), run: true},
    {name: 'real', harness: real, run: !isCI() && harnessAvailable(real)},
  ]
}
