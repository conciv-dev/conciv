import {createFakeHarness, createTestkit, type FakeHarness, type Kit} from '@conciv/harness-testkit'
import {makeApp} from '@conciv/core/app'

export type ClientKit = Kit & {harness: FakeHarness; gate: {hold: () => void; release: () => void}}

type AppPlugins = Parameters<typeof makeApp>[0]['plugins']

export async function bootClientKit(opts: {plugins?: AppPlugins} = {}): Promise<ClientKit> {
  const harness = createFakeHarness({id: 'fake-client', text: 'ok'})
  const kit = await createTestkit(harness, async (env) => {
    const {fetch, dispose, agentToken, awaitActivation} = await makeApp({
      print: env.print,
      cfg: {
        enabled: true,
        stateRoot: env.stateRoot,
        harness: env.harness.id,
        harnessBin: undefined,
        sessionId: undefined,
        harnessSessionId: undefined,
        systemPrompt: '',
        hubAccess: 'session',
        plugins: [],
        policies: [],
        permissions: [],
      },
      cwd: env.cwd,
      openInEditor: () => {},
      harness: env.harness,
      plugins: opts.plugins,
    })
    await awaitActivation()
    return {fetch, dispose, agentToken}
  }).setup()
  return {...kit, harness, gate: {hold: harness.script.hold, release: harness.script.release}}
}
