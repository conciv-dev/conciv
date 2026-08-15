import {createFakeHarness, createTestkit, type FakeHarness, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'
import type {AnyExtension} from '@conciv/extension'
import type {ToolRegistry} from '@conciv/extension/registry'
import type {HarnessCommand, HarnessModel, HarnessSessionMeta} from '@conciv/protocol/harness-types'
import type {EngineStaleness} from '@conciv/contract'

export type CoreKit = Kit & {harness: FakeHarness; registry: ToolRegistry}

export async function bootCoreKit(opts: {
  id: string
  text?: string
  extensions?: AnyExtension[]
  models?: HarnessModel[]
  commands?: HarnessCommand[]
  history?: HarnessSessionMeta[]
  allowedOrigins?: string[]
  staleness?: () => EngineStaleness
  nativePageDir?: string
}): Promise<CoreKit> {
  const harness = createFakeHarness({
    id: opts.id,
    text: opts.text ?? 'Hello from conciv',
    models: opts.models,
    commands: opts.commands,
    history: opts.history,
  })
  const captured: {registry?: ToolRegistry} = {}
  const kit = await createTestkit(harness, async (env) => {
    const {app, dispose, registry} = await makeApp({
      cfg: {
        enabled: true,
        widgetUrl: undefined,
        stateRoot: env.stateRoot,
        harness: env.harness.id,
        harnessBin: undefined,
        sessionId: '',
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
    })
    captured.registry = registry
    return {fetch: app.fetch, dispose}
  }).setup()
  const registry = captured.registry
  if (!registry) throw new Error('the core kit booted without capturing the tool registry')
  return {...kit, harness, registry}
}
