import {
  createFakeHarness,
  createRecordingTerminalOpener,
  createTestkit,
  type FakeHarness,
  type Kit,
} from '@conciv/harness-testkit'
import type {AnyExtension} from '@conciv/extension'
import {makeApp} from '@conciv/core/app'

export type ClientKit = Kit & {harness: FakeHarness; gate: {hold: () => void; release: () => void}}

export async function bootClientKit(opts: {extensions?: AnyExtension[]} = {}): Promise<ClientKit> {
  const harness = createFakeHarness({id: 'fake-client', text: 'ok'})
  const kit = await createTestkit(harness, async (env) => {
    const {app, dispose} = await makeApp({
      cfg: {
        enabled: true,
        stateRoot: env.stateRoot,
        harness: env.harness.id,
        harnessBin: undefined,
        sessionId: '',
        systemPrompt: '',
        extensions: undefined,
      },
      cwd: env.cwd,
      openInEditor: () => {},
      openTerminal: createRecordingTerminalOpener().open,
      harness: env.harness,
      extensions: opts.extensions,
    })
    return {fetch: app.fetch, dispose}
  }).setup()
  return {...kit, harness, gate: {hold: harness.script.hold, release: harness.script.release}}
}
