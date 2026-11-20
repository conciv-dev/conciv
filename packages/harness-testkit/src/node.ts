import {mkdir, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {delimiter, join} from 'node:path'
import {ConfigProvider} from 'effect'
import {test as base} from 'vitest'
import {createFakeHarness, type FakeHarness, type FakeHarnessOptions} from './create-fake-harness.js'
import {createTestkit, type BootApp, type Kit} from './create-testkit.js'
import {createFakeCli, type FakeCli} from './fake-cli.js'
import {createScriptedChat, type ScriptedChat} from './scripted-run.js'

export type FixtureEnv = Readonly<Record<string, string | undefined>>

export type HarnessFixtures = {
  env: FixtureEnv
  harnessOptions: FakeHarnessOptions
  boot: BootApp
  tmp: string
  fakeCli: FakeCli
  configProvider: ConfigProvider.ConfigProvider
  harness: FakeHarness
  chat: ScriptedChat
  kit: Kit
}

function buildConfigProvider(env: FixtureEnv, fakeCli: FakeCli): ConfigProvider.ConfigProvider {
  const path = env.PATH === undefined || env.PATH === '' ? fakeCli.bin : `${fakeCli.bin}${delimiter}${env.PATH}`
  return ConfigProvider.fromUnknown({...env, PATH: path})
}

const missingBoot: BootApp = () =>
  Promise.reject(new Error("the kit fixture boots an app: pass one with test.override('boot', () => boot)"))

export const test = base
  .extend('boot', (): BootApp => missingBoot)
  .extend<Omit<HarnessFixtures, 'boot'>>({
    env: {},
    harnessOptions: {},
    tmp: async ({task}, use) => {
      const folder = await mkdtemp(join(tmpdir(), `conciv-tmp-${task.id}-`))
      await use(folder)
      await rm(folder, {recursive: true, force: true, maxRetries: 10, retryDelay: 50})
    },
    fakeCli: async ({tmp}, use) => {
      const bin = join(tmp, 'fake-cli-bin')
      await mkdir(bin)
      await use(createFakeCli(bin))
    },
    configProvider: async ({env, fakeCli}, use) => {
      await use(buildConfigProvider(env, fakeCli))
    },
    harness: async ({harnessOptions}, use) => {
      const harness = createFakeHarness(harnessOptions)
      await use(harness)
      harness.transcripts.release()
    },
    chat: async ({harness}, use) => {
      const chat = createScriptedChat(harness.script)
      await use(chat)
      chat.release()
    },
    kit: async ({harness, boot, configProvider}, use) => {
      const kit = await createTestkit(harness, boot, {configProvider}).setup()
      await use(kit)
      await kit.cleanup()
    },
  })
