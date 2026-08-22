import {createFakeHarness, createTestkit, type FakeHarness, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'
import type {AnyExtension} from '@conciv/extension'
import type {CoreRuntime, SessionScope} from '@conciv/core/runtime'
import type {SessionId} from '@conciv/protocol/chat-types'
import type {HarnessCommand, HarnessConnect, HarnessModel, HarnessSessionMeta} from '@conciv/protocol/harness-types'
import type {EngineStaleness} from '@conciv/contract'

export type CoreKit = Kit & {harness: FakeHarness; forSession: (id: SessionId) => SessionScope}

export async function bootCoreKit(opts: {
  id: string
  text?: string
  resume?: boolean
  displayName?: string
  connect?: HarnessConnect
  extensions?: AnyExtension[]
  models?: HarnessModel[]
  commands?: HarnessCommand[]
  history?: HarnessSessionMeta[]
  allowedOrigins?: string[]
  staleness?: () => EngineStaleness
  nativePageDir?: string
  globalStateDir?: string
}): Promise<CoreKit> {
  const harness = createFakeHarness({
    id: opts.id,
    text: opts.text ?? 'Hello from conciv',
    ...(opts.resume ? {resume: true} : {}),
    ...(opts.displayName ? {displayName: opts.displayName} : {}),
    ...(opts.connect ? {connect: opts.connect} : {}),
    models: opts.models,
    commands: opts.commands,
    history: opts.history,
  })
  const captured: {runtime?: CoreRuntime} = {}
  const kit = await createTestkit(harness, async (env) => {
    const {app, dispose, runtime} = await makeApp({
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
      },
      cwd: env.cwd,
      openInEditor: () => {},
      harness: env.harness,
      extensions: opts.extensions,
      allowedOrigins: opts.allowedOrigins,
      staleness: opts.staleness,
      nativePageDir: opts.nativePageDir,
      globalStateDir: opts.globalStateDir,
    })
    captured.runtime = runtime
    return {fetch: app.fetch, dispose}
  }).setup()
  const runtime = captured.runtime
  if (!runtime) throw new Error('the core kit booted without capturing the core runtime')
  return {...kit, harness, forSession: runtime.forSession}
}
