import {
  createFakeHarness,
  createTestkit,
  type FakeHarness,
  type FixtureSession,
  type Kit,
} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'
import type {AnyExtension} from '@conciv/extension'
import type {CoreRuntime, SessionScope} from '@conciv/core/runtime'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {HarnessCommand, HarnessModel} from '@conciv/protocol/harness-types'
import type {EngineStaleness} from '@conciv/contract'

export type CoreKit = Kit & {
  harness: FakeHarness
  forSession: (id: SessionId) => SessionScope
}

export type AlternateHarness = {
  id: string
  displayName: string
  text?: string
  models?: HarnessModel[]
  commands?: HarnessCommand[]
}

export async function bootCoreKit(opts: {
  id: string
  text?: string
  resume?: boolean
  displayName?: string
  extensions?: AnyExtension[]
  models?: HarnessModel[]
  commands?: HarnessCommand[]
  history?: FixtureSession[]
  resumeBin?: string
  alternates?: AlternateHarness[]
  allowedOrigins?: string[]
  staleness?: () => EngineStaleness
  nativePageDir?: string
}): Promise<CoreKit> {
  const harness = createFakeHarness({
    id: opts.id,
    text: opts.text ?? 'Hello from conciv',
    ...(opts.resume ? {resume: true} : {}),
    ...(opts.displayName ? {displayName: opts.displayName} : {}),
    models: opts.models,
    commands: opts.commands,
    history: opts.history,
    resumeBin: opts.resumeBin,
  })
  const captured: {runtime?: CoreRuntime} = {}
  const kit = await createTestkit(harness, async (env) => {
    const {fetch, dispose, runtime, agentToken} = await makeApp({
      print: env.print,
      cfg: {
        enabled: true,
        widgetUrl: undefined,
        stateRoot: env.stateRoot,
        harness: env.harness.id,
        harnessBin: undefined,
        sessionId: undefined,
        harnessSessionId: undefined,
        systemPrompt: '',
        extensions: undefined,
        hubAccess: 'session',
      },
      cwd: env.cwd,
      openInEditor: () => {},
      harness: env.harness,
      harnesses: (opts.alternates ?? []).map((alternate) => createFakeHarness(alternate)),
      extensions: opts.extensions,
      allowedOrigins: opts.allowedOrigins,
      staleness: opts.staleness,
      nativePageDir: opts.nativePageDir,
    })
    captured.runtime = runtime
    return {
      fetch,
      dispose,
      agentToken,
    }
  }).setup()
  const runtime = captured.runtime
  if (!runtime) throw new Error('the core kit booted without capturing the core runtime')
  return {
    ...kit,
    harness,
    forSession: runtime.forSession,
  }
}
