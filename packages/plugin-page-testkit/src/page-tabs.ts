import {randomUUID} from 'node:crypto'
import {once} from 'node:events'
import {Plugin} from '@conciv/plugin'
import * as Page from '@conciv/plugin-page/rpc'
import {SessionId} from '@conciv/protocol/chat-types'
import {type z} from 'zod'

export type PageReply = z.input<typeof Page.Outcome>

export type PageAnswer = (command: Page.Command, requestId: string) => PageReply | undefined

export type PageTab = {
  end: () => void
  seen: () => string[]
  focus: (focused: boolean) => Promise<void>
  requested: () => Promise<string>
  cancelled: (requestId: string) => Promise<void>
  command: (requestId: string) => Promise<Page.Command>
  reply: (requestId: string, outcome: PageReply) => Promise<void>
}

export type TabLook = {url: string; title: string; focused: boolean; visible: boolean}

export type OpenTab = (sessionId: string, answerFor: PageAnswer, look?: Partial<TabLook>) => Promise<PageTab>

export function pageTabs(): {plugin: Plugin.Plugin; open: OpenTab} {
  type Answering = {
    sessionId: SessionId
    answerFor: PageAnswer
    seen: string[]
    requests: string[]
    cancels: string[]
    heard: EventTarget
  }
  const answering = new Map<string, Answering>()
  const attached = new EventTarget()
  const ready = Promise.withResolvers<OpenTab>()
  const plugin = Plugin.define({
    id: 'page-tab-fixture',
    async setup(ctx) {
      const page = ctx.rpc(Page.Definition)
      const stop = new AbortController()
      page.events.on(
        'control',
        async ({data: control}) => {
          if (control.type === 'attached') attached.dispatchEvent(new Event(control.connectionId))
          const tab = answering.get(control.connectionId)
          if (control.type === 'attached' || tab === undefined) return
          const {connectionId, requestId} = control
          if (control.type === 'cancel') {
            tab.cancels.push(requestId)
            tab.heard.dispatchEvent(new Event('cancel'))
            return
          }
          tab.requests.push(requestId)
          tab.heard.dispatchEvent(new Event('command'))
          const command = await page.command({sessionId: tab.sessionId, connectionId, requestId})
          tab.seen.push(`page_${command.action.type}`)
          const outcome = tab.answerFor(command, requestId)
          if (outcome === undefined) return
          await page.result({sessionId: tab.sessionId, connectionId, requestId, outcome})
        },
        {signal: stop.signal},
      )
      ready.resolve(async (session, answerFor, look = {}) => {
        const sessionId = SessionId.parse(session)
        const connectionId = `conn_${randomUUID()}`
        const closing = new AbortController()
        const seen: string[] = []
        const requests: string[] = []
        const cancels: string[] = []
        const heard = new EventTarget()
        const read = {next: 0}
        answering.set(connectionId, {sessionId, answerFor, seen, requests, cancels, heard})
        const state = {
          id: `tab_${randomUUID()}`,
          url: 'https://example.com/',
          title: 'Example',
          focused: true,
          visible: true,
          ...look,
        }
        const joinPage = async () => {
          const joined = once(attached, connectionId, {signal: closing.signal}).then(() =>
            page.state({sessionId, connectionId, state}),
          )
          const ended = page.attach({sessionId, connectionId, version: 1}, {signal: closing.signal}).catch(() => {})
          await joined
          return {ended}
        }
        const keep = async ({ended}: {ended: Promise<unknown>}): Promise<void> => {
          await ended
          if (closing.signal.aborted) return
          return keep(await joinPage())
        }
        void keep(await joinPage()).catch(() => {})
        return {
          end: () => closing.abort(),
          seen: () => [...seen],
          focus: (focused) => page.state({sessionId, connectionId, state: {...state, focused}}),
          requested: async () => {
            const index = read.next
            read.next += 1
            while (requests.length <= index) await once(heard, 'command')
            return requests[index] ?? ''
          },
          cancelled: async (requestId) => {
            while (!cancels.includes(requestId)) await once(heard, 'cancel')
          },
          command: (requestId) => page.command({sessionId, connectionId, requestId}),
          reply: async (requestId, outcome) => {
            await page.result({sessionId, connectionId, requestId, outcome})
          },
        }
      })
      return () => stop.abort()
    },
  })
  return {plugin, open: async (sessionId, answerFor, look) => (await ready.promise)(sessionId, answerFor, look)}
}
