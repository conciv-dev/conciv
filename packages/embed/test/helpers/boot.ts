import {createFakeHarness, createTestkit, type FakeHarness, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'

export type EmbedKit = Kit & {harness: FakeHarness}

export async function bootEmbedKit(opts: {text?: string} = {}): Promise<EmbedKit> {
  const harness = createFakeHarness({id: 'fake-embed', text: opts.text ?? 'Hello from conciv'})
  const kit = await createTestkit(harness, async (env) => {
    const {app, disposers} = await makeApp({
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
    })
    return {
      fetch: app.fetch,
      dispose: async () => {
        await Promise.all(disposers.map((dispose) => dispose()))
      },
    }
  }).setup()
  return {...kit, harness}
}
