import {existsSync} from 'node:fs'
import {readdir, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {test as base, type Page, type TestInfo} from '@playwright/test'
import {makeRpcClient, type RpcClient, type SettingsScope} from '@conciv/contract'
import {concivStateDir} from '@conciv/protocol/state-types'
import {e2eConfigDir} from './config.js'
import {e2ePluginCopyDir} from './dev-endpoint.js'
import {recordedEngineBase, testProjectDir} from './login.js'
import {collectFailures, expectWidgetBoots, loginWidget} from './widget.js'

type RebuildPlugin = (plugin: string, from: string, to: string) => Promise<void>

const SESSION_PAGE = 100
const SETTINGS_FILE = '.json'

async function signIn(page: Page, signedIn: boolean): Promise<void> {
  const failures = collectFailures(page)
  if (!signedIn) return
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
}

async function listEverySession(rpc: RpcClient) {
  let page = await rpc.sessions.list({limit: SESSION_PAGE})
  const sessions = [...page.sessions]
  while (page.next !== null) {
    page = await rpc.sessions.list({cursor: page.next, limit: SESSION_PAGE})
    sessions.push(...page.sessions)
  }
  return sessions
}

async function settingsNamespaces(folder: string): Promise<string[]> {
  const settings = join(folder, 'settings')
  if (!existsSync(settings)) return []
  const files = await readdir(settings)
  return files.filter((file) => file.endsWith(SETTINGS_FILE)).map((file) => file.slice(0, -SETTINGS_FILE.length))
}

async function resetSettings(rpc: RpcClient, scope: SettingsScope, folder: string): Promise<void> {
  for (const namespace of await settingsNamespaces(folder)) {
    const {value} = await rpc.settings.all({scope, namespace})
    for (const key of Object.keys(value)) await rpc.settings.delete({scope, namespace, key})
  }
}

function testConcivHome(testInfo: TestInfo): string {
  const home: unknown = testInfo.project.metadata['concivHome']
  if (typeof home !== 'string')
    throw new Error(`the ${testInfo.project.name} project sets no concivHome in its metadata`)
  return home
}

async function resetEngine(testInfo: TestInfo): Promise<void> {
  const projectDir = testProjectDir()
  const rpc = makeRpcClient(recordedEngineBase(projectDir))
  for (const session of await listEverySession(rpc)) await rpc.sessions.delete({sessionId: session.id})
  await resetSettings(rpc, 'project', concivStateDir(projectDir))
  await resetSettings(rpc, 'global', testConcivHome(testInfo))
}

export const test = base.extend<{
  signedIn: boolean
  secondPage: Page
  rebuildPlugin: RebuildPlugin
  resetEngineAfter: void
}>({
  signedIn: [true, {option: true}],
  resetEngineAfter: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      await use()
      await resetEngine(testInfo)
    },
    {auto: true},
  ],
  page: async ({page, signedIn}, use) => {
    await signIn(page, signedIn)
    await use(page)
  },
  secondPage: async ({browser, signedIn}, use) => {
    const page = await browser.newPage()
    await signIn(page, signedIn)
    await use(page)
    await page.close()
  },
  // eslint-disable-next-line no-empty-pattern
  rebuildPlugin: async ({}, use, testInfo) => {
    const originals: {bundle: string; source: string}[] = []
    await use(async (plugin, from, to) => {
      const bundle = join(e2ePluginCopyDir(e2eConfigDir(testInfo.config.configFile), plugin), 'plugin-experimental.js')
      const source = await readFile(bundle, 'utf8')
      originals.unshift({bundle, source})
      if (!source.includes(from)) throw new Error(`${bundle} does not contain "${from}"`)
      await writeFile(bundle, source.replace(from, to))
    })
    for (const {bundle, source} of originals) await writeFile(bundle, source)
  },
})

export {expect} from '@playwright/test'
