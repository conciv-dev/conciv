import {createFakeEngine, type FakeSession, type FakeTool} from '@conciv/client/testing'
import {useFakeEngine, type TestPlugin} from '@internal/frontend-test-utils'
import {renderTestApp} from '@internal/frontend-test-utils/app'
import pagePlugin from '../../src/renderer.js'
import {createPageSessionGrouper, pageSessionEntry} from '../../src/client.js'
import {Definition} from '../../src/rpc.js'
import {createFakePage} from './fake-page.js'

export type OpenPage = {
  readonly sessions?: readonly FakeSession[]
  readonly taskTimeoutMs?: number
  readonly plugins?: readonly TestPlugin[]
  readonly tools?: Readonly<Record<string, FakeTool>>
}

const PAGE_ENTRY: TestPlugin = {
  id: 'conciv.page',
  plugin: pagePlugin,
  builtin: true,
  engineHalf: true,
  toolGroup: {entry: pageSessionEntry, createGrouper: createPageSessionGrouper},
}

const PAGE_LISTING = {
  id: 'conciv.page',
  source: {type: 'builtin' as const},
  features: {server: true as const},
  state: {status: 'active' as const},
}

export async function openPage(options: OpenPage = {}) {
  const pageRpc = createFakePage()
  const engine = useFakeEngine(
    createFakeEngine({
      sessions: options.sessions,
      tools: options.tools,
      plugins: {[Definition.id]: pageRpc.handlers},
      handlers: {
        plugin: {list: () => ({location: {directory: '/workspace'}, data: [PAGE_LISTING]})},
      },
    }),
  )
  const entry =
    options.taskTimeoutMs === undefined ? PAGE_ENTRY : {...PAGE_ENTRY, options: {taskTimeoutMs: options.taskTimeoutMs}}
  await renderTestApp({engine, plugins: [entry, ...(options.plugins ?? [])]})
  const sessionId = await pageRpc.attached()
  return {engine, pageRpc, sessionId}
}
