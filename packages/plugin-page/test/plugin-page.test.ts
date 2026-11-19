import {tempDir} from '@conciv/vitest-config/temp-dir'
import {readFileSync} from 'node:fs'
import {readFile, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, extname, join} from 'node:path'
import {GenMapping, addMapping, toEncodedMap} from '@jridgewell/gen-mapping'
import {Effect} from 'effect'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {SessionId} from '@conciv/protocol/chat-types'
import {Tool} from '@conciv/plugin/schema/tool'
import * as PageMachine from '../src/machine.js'
import * as PageQueue from '../src/queue.js'
import * as Page from '../src/rpc.js'
import * as PageSkill from '../src/skill.js'
import {symbolicateFrame} from '../src/symbolicate.js'
import {PAGE_TOOL_DEFS, readPageVerb} from './fixtures/page-tool-defs.js'

const tabId = `tab_${crypto.randomUUID()}`

function exported(schema: z.ZodType) {
  return schema['~standard'].jsonSchema.input({target: 'draft-2020-12'})
}

const JsonObject = z.looseObject({
  properties: z.record(z.string(), z.unknown()),
  required: z.array(z.string()).optional(),
})

function withoutTab(schema: z.ZodType) {
  const json = JsonObject.parse(exported(schema))
  return {...json, properties: Object.fromEntries(Object.entries(json.properties).filter(([key]) => key !== 'tabId'))}
}

function pairWithOperation<Definition extends (typeof PAGE_TOOL_DEFS)[number]>(definition: Definition) {
  const operation = Page.Operations.find((candidate) => candidate.name === readPageVerb(definition.name))
  if (!operation) throw new Error(`${definition.name} has no page operation`)
  return [definition.name, definition, operation] as const
}

describe('page rpc', () => {
  it('every page operation takes an optional tab ID, the last focused tab serving a call without one', () => {
    for (const operation of Page.Operations) {
      if (operation.name === 'tabs.list') continue
      const {properties, required} = JsonObject.parse(exported(operation.input))
      expect(properties, operation.name).toHaveProperty('tabId')
      expect(required ?? [], operation.name).not.toContain('tabId')
    }
    expect(z.parse(Page.Action, {type: 'tabs.list'})).toEqual({type: 'tabs.list'})
    expect(z.parse(Page.Action, {type: 'route'})).toEqual({type: 'route'})
    expect(z.parse(Page.Action, {type: 'route', tabId})).toEqual({type: 'route', tabId})
  })

  it('page input bounds and optional fields survive the wire', () => {
    const decode = (input: unknown) => z.parse(Page.Action, input)
    expect(decode({type: 'console', tabId})).toEqual({type: 'console', tabId})
    expect(decode({type: 'console', tabId, since: '12'})).toEqual({type: 'console', tabId, since: 12})
    expect(decode({type: 'hmr', tabId})).toEqual({type: 'hmr', tabId, timeout: 5000})
    expect(() => decode({type: 'hmr', tabId, timeout: -1})).toThrow()
    expect(() => decode({type: 'wait', tabId, state: 'gone'})).toThrow()
    expect(() => decode({type: 'click', tabId: 'another-tab', ref: 'v1'})).toThrow()
    expect(decode({type: 'click', tabId, ref: 'v5'})).toMatchObject({ref: 'v5'})
    expect(() => decode({type: 'insert', tabId, html: '<b>', position: 'inside'})).toThrow()
    expect(() => decode({type: 'queue', tabId, actions: []})).toThrow()
    expect(() =>
      decode({type: 'queue', tabId, actions: Array.from({length: 51}, () => ({tool: 'page_click'}))}),
    ).toThrow()
    expect(() => decode({type: 'queue', tabId, actions: [{tool: 'page_eval', code: '1'}]})).toThrow()
  })

  it('page files are bounded bytes, not remote filesystem paths', () => {
    const id = `file_${crypto.randomUUID()}`
    const decode = (input: unknown) => z.parse(Page.File, input)
    expect(decode({id, name: 'file.bin', mime: 'application/octet-stream', data: 'AAEC/w=='}).data).toEqual(
      new Uint8Array([0, 1, 2, 255]),
    )
    expect(() =>
      decode({
        id,
        name: 'file.bin',
        mime: 'application/octet-stream',
        data: Buffer.alloc(Page.MAX_FILE_BYTES + 1).toString('base64'),
      }),
    ).toThrow()
  })

  it('the RPC version is explicit', () => {
    const decode = (input: unknown) => z.parse(Page.Control, input)
    expect(() => decode({type: 'attached', connectionId: 'old-client'})).toThrow()
    expect(() => decode({type: 'attached', connectionId: 'old-client', version: 2})).toThrow()
    const current = {type: 'attached', connectionId: 'client', version: 1}
    expect(decode(current)).toEqual(current)
    expect(z.parse(Page.Definition.methods.attach.output, 'replaced')).toBe('replaced')
  })

  it('symbolicate takes bounded frames and nothing else, and answers a source location or null', () => {
    const {input, output} = Page.Definition.methods.symbolicate
    const frames = [{fileName: 'chunk.js', line: 2, column: 1}]
    expect(z.parse(input, {frames})).toEqual({frames})
    expect(z.parse(input, {frames, sessionId: 'conciv_any'})).toEqual({frames})
    expect(() => z.parse(input, {frames: []})).toThrow()
    expect(() => z.parse(input, {frames: Array.from({length: 33}, () => frames[0])})).toThrow()
    expect(() => z.parse(input, {frames: [{fileName: '', line: 2}]})).toThrow()
    const source = {file: 'app/page.tsx', line: 17, column: 4}
    expect(z.parse(output, source)).toEqual(source)
    expect(z.parse(output, null)).toBeNull()
  })

  it('page ID patterns survive JSON Schema export for model tool definitions', () => {
    expect(exported(Page.TabId)).toMatchObject({type: 'string', pattern: '^tab_[a-f0-9-]{36}$'})
    expect(exported(Page.FileId)).toMatchObject({type: 'string', pattern: '^file_[a-f0-9-]{36}$'})
  })

  it.each(PAGE_TOOL_DEFS.map(pairWithOperation))(
    '%s keeps its input and output schema, mutating and capture as an operation',
    (_name, definition, operation) => {
      expect(withoutTab(operation.input)).toEqual(exported(definition.inputSchema))
      if (operation.name !== 'screenshot') expect(exported(operation.output)).toEqual(exported(definition.outputSchema))
      expect([operation.mutating, operation.capture]).toEqual([definition.meta.mutating, definition.meta.capture])
    },
  )

  it('the operations are the page tools plus tabs.list and fill_form', () => {
    expect(Page.Operations.map((operation) => operation.name).toSorted()).toEqual(
      ['tabs.list', 'fill_form', ...PAGE_TOOL_DEFS.map((definition) => readPageVerb(definition.name))].toSorted(),
    )
  })
})

describe('page skill', () => {
  it('the built-in page skill uses a virtual skill:// URI', () => {
    expect(PageSkill.info.path).toBe('skill://page/SKILL.md')
  })
})

const sessionId = SessionId.parse('conciv_page')
const other = SessionId.parse('conciv_other')
const tab: Page.Tab = {id: tabId, url: 'https://example.com/', title: 'Example', focused: true, visible: true}

type MachineEvent = PageMachine.ConnectionEvent

function run(state: PageMachine.ConnectionState, ...events: MachineEvent[]) {
  return events.reduce(
    (result, event) => {
      const next = PageMachine.transitionConnection(result.state, event)
      return {state: next.state, effects: [...result.effects, ...next.effects]}
    },
    {state, effects: new Array<PageMachine.ConnectionEffect>()},
  )
}

function opening(state: PageMachine.ConnectionState, connectionId: string, id = sessionId): MachineEvent {
  return {type: 'attach.started', sessionId: id, attempt: PageMachine.selectNextAttempt(state), connectionId}
}

function entry(state: PageMachine.ConnectionState, id = sessionId) {
  return state.sessions.get(id)
}

function syncs(effects: readonly PageMachine.ConnectionEffect[]) {
  return effects.flatMap((effect) => (effect.type === 'sync-permissions' ? [effect] : []))
}

function lastSync(effects: readonly PageMachine.ConnectionEffect[]) {
  const sync = syncs(effects).at(-1)
  if (!sync) throw new Error('expected a permission sync')
  return sync
}

function synced(attempt: number, id = sessionId): MachineEvent {
  return {type: 'permissions.synced', sessionId: id, attempt}
}

function controls(effects: readonly PageMachine.ConnectionEffect[]) {
  return effects.flatMap((effect) => (effect.type === 'emit-control' ? [effect.control] : []))
}

function attached(connectionId = 'conn_1') {
  const initial = PageMachine.createConnectionState()
  const first = run(initial, opening(initial, connectionId))
  return run(first.state, synced(lastSync(first.effects).attempt)).state
}

function reported(connectionId: string, report: Page.Tab): MachineEvent {
  return {type: 'state.updated', sessionId, connectionId, tab: report}
}

describe('page machine: one attachment per tab', () => {
  it('a closing tab never revokes the grant another tab of the session holds', () => {
    const first = attached()
    const second = run(first, opening(first, 'conn_2'))
    expect(second.effects).toEqual([
      {type: 'emit-control', control: {type: 'attached', connectionId: 'conn_2', version: 1}},
    ])
    expect(PageMachine.isAttachedConnection(second.state, sessionId, 'conn_1')).toBe(true)
    expect(PageMachine.isAttachedConnection(second.state, sessionId, 'conn_2')).toBe(true)

    const closed = run(second.state, {type: 'attach.closed', sessionId, attempt: 1})
    expect(closed.effects).toEqual([{type: 'close-attachment', attempt: 1, outcome: 'closed'}])
    expect(PageMachine.isAttachedConnection(closed.state, sessionId, 'conn_1')).toBe(false)
    expect(PageMachine.selectTarget(closed.state, sessionId, undefined)).toMatchObject({
      ok: true,
      connectionId: 'conn_2',
    })
  })

  it('a tab that attaches again replaces its own earlier attachment', () => {
    const live = attached()
    const again = run(live, opening(live, 'conn_1'))
    expect(again.effects).toContainEqual({type: 'close-attachment', attempt: 1, outcome: 'replaced'})
    expect(controls(again.effects)).toEqual([{type: 'attached', connectionId: 'conn_1', version: 1}])
    expect(syncs(again.effects)).toEqual([])

    const late = PageMachine.transitionConnection(again.state, {type: 'attach.closed', sessionId, attempt: 1})
    expect(late.state).toBe(again.state)
    expect(late.effects).toEqual([])
  })

  it('a re-attach waits for the revoke in flight, then grants', () => {
    const closed = run(attached(), {type: 'attach.closed', sessionId, attempt: 1})
    const revoke = lastSync(closed.effects)
    expect(revoke).toMatchObject({allow: false})

    const reopened = run(closed.state, opening(closed.state, 'conn_2'))
    expect(reopened.effects).toEqual([])
    expect(entry(reopened.state)).toMatchObject({status: 'attaching', sync: {attempt: revoke.attempt, allow: false}})

    const revoked = run(reopened.state, synced(revoke.attempt))
    const grant = lastSync(revoked.effects)
    expect(grant).toMatchObject({allow: true})
    expect(controls(revoked.effects)).toEqual([])

    const done = run(revoked.state, synced(grant.attempt))
    expect(controls(done.effects)).toEqual([{type: 'attached', connectionId: 'conn_2', version: 1}])
  })

  it('a call while a tab re-attaches over the revoke in flight, its allow rules still in place, answers still connecting', () => {
    const closed = run(attached(), {type: 'attach.closed', sessionId, attempt: 1})
    const reopened = run(closed.state, opening(closed.state, 'conn_2'))
    expect(entry(reopened.state)).toMatchObject({status: 'attaching', sync: {allow: false}})
    expect(PageMachine.selectTarget(reopened.state, sessionId, undefined)).toEqual({
      ok: false,
      error: expect.objectContaining({
        message:
          '[page.disconnected] The page is still connecting to this session; no action ran. Call page.tabs.list({}) once it finishes connecting.',
      }),
    })
  })

  it('two tabs attaching at once share the grant in flight and both get attached', () => {
    const initial = PageMachine.createConnectionState()
    const first = run(initial, opening(initial, 'conn_1'))
    const grant = lastSync(first.effects)
    const second = run(first.state, opening(first.state, 'conn_2'))
    expect(second.effects).toEqual([])

    const done = run(second.state, synced(grant.attempt))
    expect(controls(done.effects)).toEqual([
      {type: 'attached', connectionId: 'conn_1', version: 1},
      {type: 'attached', connectionId: 'conn_2', version: 1},
    ])
  })
})

describe('page machine: handshake', () => {
  it('no tool reaches an attachment before its grant succeeds', () => {
    const initial = PageMachine.createConnectionState()
    const first = run(initial, opening(initial, 'conn_1'))
    expect(controls(first.effects)).toEqual([])
    expect(PageMachine.selectTarget(first.state, sessionId, undefined)).toMatchObject({
      ok: false,
      error: {message: expect.stringContaining('still connecting')},
    })

    const report = PageMachine.transitionConnection(first.state, reported('conn_1', tab))
    expect(report.state).toBe(first.state)

    const done = run(first.state, synced(lastSync(first.effects).attempt))
    expect(controls(done.effects)).toEqual([{type: 'attached', connectionId: 'conn_1', version: 1}])
    expect(PageMachine.selectTarget(done.state, sessionId, undefined)).toMatchObject({
      ok: true,
      connectionId: 'conn_1',
      attempt: 1,
    })
  })

  it('attach.closed while attaching never sends attached and revokes after the grant settles', () => {
    const initial = PageMachine.createConnectionState()
    const first = run(initial, opening(initial, 'conn_1'))
    const grant = lastSync(first.effects)
    const closed = run(first.state, {type: 'attach.closed', sessionId, attempt: 1})
    expect(closed.effects).toEqual([{type: 'close-attachment', attempt: 1, outcome: 'closed'}])

    const settled = run(closed.state, synced(grant.attempt))
    expect(controls(settled.effects)).toEqual([])
    const revoke = lastSync(settled.effects)
    expect(revoke).toMatchObject({allow: false})

    const done = run(settled.state, synced(revoke.attempt))
    expect(entry(done.state)).toBeUndefined()
    expect(done.effects).toEqual([])
  })

  it('a request for a tab that closed after the tool selected it is never sent: its attempt closes and no tab serves it', () => {
    const first = attached()
    const both = run(first, opening(first, 'conn_2')).state
    expect(PageMachine.selectTarget(both, sessionId, undefined)).toMatchObject({ok: true, attempt: 3})
    const closed = run(both, {type: 'attach.closed', sessionId, attempt: 3})
    expect(closed.effects).toEqual([{type: 'close-attachment', attempt: 3, outcome: 'closed'}])
    expect(PageMachine.isAttachedConnection(closed.state, sessionId, 'conn_2')).toBe(false)
    expect(PageMachine.selectTarget(closed.state, sessionId, undefined)).toMatchObject({ok: true, attempt: 1})
  })
})

describe('page machine: permission syncs', () => {
  it.each([
    {type: 'permissions.failed' as const, error: new Error('session gone')},
    {type: 'permissions.timed-out' as const},
  ])('a grant that ends with $type fails the attach and revokes what it may have written', (failed) => {
    const initial = PageMachine.createConnectionState()
    const first = run(initial, opening(initial, 'conn_1'))
    const grant = lastSync(first.effects)
    const next = run(first.state, {...failed, sessionId, attempt: grant.attempt})
    expect(next.effects).toContainEqual({type: 'close-attachment', attempt: 1, outcome: 'unavailable'})
    expect(next.effects.some((effect) => effect.type === 'warn')).toBe(true)
    expect(controls(next.effects)).toEqual([])
    const revoke = lastSync(next.effects)
    expect(revoke).toMatchObject({allow: false})

    const done = run(next.state, {type: 'permissions.failed', sessionId, attempt: revoke.attempt, error: undefined})
    expect(entry(done.state)).toBeUndefined()
    expect(syncs(done.effects)).toEqual([])
  })

  it('a failed revoke before a re-attach still grants the new attachment', () => {
    const closed = run(attached(), {type: 'attach.closed', sessionId, attempt: 1})
    const reopened = run(closed.state, opening(closed.state, 'conn_2'))
    const next = run(reopened.state, {
      type: 'permissions.timed-out',
      sessionId,
      attempt: lastSync(closed.effects).attempt,
    })
    expect(lastSync(next.effects)).toMatchObject({allow: true})
    expect(entry(next.state)).toMatchObject({status: 'attaching', connections: new Map([['conn_2', 4]])})
  })

  it('stale sync results and stale attach events change nothing', () => {
    const initial = PageMachine.createConnectionState()
    const first = run(initial, opening(initial, 'conn_1'))
    const stale: MachineEvent[] = [
      synced(99),
      {type: 'permissions.failed', sessionId, attempt: 99, error: undefined},
      {type: 'permissions.timed-out', sessionId, attempt: 99},
      synced(lastSync(first.effects).attempt, other),
      {type: 'attach.closed', sessionId, attempt: 99},
      {type: 'attach.started', sessionId, attempt: 1, connectionId: 'conn_9'},
    ]
    for (const event of stale) {
      const next = PageMachine.transitionConnection(first.state, event)
      expect(next.state).toBe(first.state)
      expect(next.effects).toEqual([])
    }
  })
})

describe('page machine: reconcilePagePermissions', () => {
  const user = {action: 'bash', resource: '*', effect: 'ask'} as const
  const allows = PageMachine.ACCESS.map((rule) => ({...rule, effect: 'allow' as const}))

  it('granting what is already granted writes nothing', () => {
    expect(PageMachine.reconcilePagePermissions([user, ...allows], true)).toBeUndefined()
    expect(PageMachine.reconcilePagePermissions([user], false)).toBeUndefined()
    expect(PageMachine.reconcilePagePermissions(undefined, false)).toBeUndefined()
  })

  it("revoking removes every duplicate and keeps the user's rules in order", () => {
    expect(PageMachine.reconcilePagePermissions([...allows, user, ...allows], false)).toEqual([user])
    expect(PageMachine.reconcilePagePermissions([...allows, user, ...allows], true)).toEqual([user, ...allows])
    expect(PageMachine.reconcilePagePermissions(undefined, true)).toEqual(allows)
  })

  it('page denies are not page allows', () => {
    const deny = {action: 'page', resource: '*', effect: 'deny'} as const
    expect(PageMachine.reconcilePagePermissions([deny], false)).toBeUndefined()
  })
})

describe('page machine: tab state', () => {
  it('a tab ID resolves to the tab that reported it, a call without one goes to the tab focused last', () => {
    const second = `tab_${crypto.randomUUID()}`
    const first = attached()
    const both = run(first, opening(first, 'conn_2')).state
    const stale = PageMachine.transitionConnection(both, {...reported('conn_9', tab)})
    expect(stale.state).toBe(both)
    expect(PageMachine.selectTarget(both, sessionId, tabId)).toMatchObject({
      ok: false,
      error: {message: expect.stringContaining('[page.tab_unavailable]')},
    })
    expect(PageMachine.selectTarget(both, sessionId, undefined)).toMatchObject({connectionId: 'conn_2'})

    const focusedFirst = run(
      both,
      reported('conn_2', {...tab, id: second, focused: false}),
      reported('conn_1', tab),
    ).state
    expect(PageMachine.selectTarget(focusedFirst, sessionId, second)).toMatchObject({
      connectionId: 'conn_2',
    })
    expect(PageMachine.selectTarget(focusedFirst, sessionId, undefined)).toMatchObject({
      ok: true,
      connectionId: 'conn_1',
      tab,
    })
    expect(PageMachine.selectTabs(focusedFirst, sessionId)).toEqual({
      tabs: [tab, {...tab, id: second, focused: false}],
      focusedTabId: tabId,
    })

    const blurred = run(focusedFirst, reported('conn_1', {...tab, focused: false})).state
    expect(PageMachine.selectTarget(blurred, sessionId, undefined)).toMatchObject({connectionId: 'conn_1'})
    const focusedSecond = run(blurred, reported('conn_2', {...tab, id: second, focused: true})).state
    expect(PageMachine.selectTarget(focusedSecond, sessionId, undefined)).toMatchObject({
      connectionId: 'conn_2',
    })
  })

  it('a session attached with no tab state yet is in neither sessions.attached nor its tabs', () => {
    const noTabYet = attached()
    expect(PageMachine.selectAttachedSessions(noTabYet)).toEqual([])
    expect(PageMachine.selectTabs(noTabYet, sessionId)).toEqual({tabs: [], focusedTabId: null})

    const withTab = run(noTabYet, reported('conn_1', tab)).state
    expect(PageMachine.selectAttachedSessions(withTab)).toEqual([sessionId])
    expect(PageMachine.selectTabs(withTab, sessionId)).toEqual({tabs: [tab], focusedTabId: tabId})
  })
})

describe('page machine: session lifecycle', () => {
  it('deleting an attached session closes every tab without a revoke', () => {
    const first = attached()
    const next = run(run(first, opening(first, 'conn_2')).state, {type: 'session.deleted', sessionId})
    expect(next.effects).toEqual([
      {type: 'close-attachment', attempt: 1, outcome: 'closed'},
      {type: 'close-attachment', attempt: 3, outcome: 'closed'},
    ])
    expect(entry(next.state)).toBeUndefined()
  })

  it('deleting an attaching session ends after its grant settles, without a revoke', () => {
    const initial = PageMachine.createConnectionState()
    const first = run(initial, opening(initial, 'conn_1'))
    const deleted = run(first.state, {type: 'session.deleted', sessionId})
    expect(entry(deleted.state)).toMatchObject({status: 'revoking', deleted: true})

    const done = run(deleted.state, synced(lastSync(first.effects).attempt))
    expect(entry(done.state)).toBeUndefined()
    expect(done.effects).toEqual([])
  })
})

describe('page machine: disposal', () => {
  it('an idle plugin drains at once', () => {
    const next = run(PageMachine.createConnectionState(), {type: 'disposed'})
    expect(next.effects).toEqual([{type: 'notify-drained'}])
    expect(PageMachine.isConnectionDisposed(next.state)).toBe(true)
  })

  it('disposal closes every attachment at once and drains only when the last revoke settles', () => {
    const first = attached()
    const withOther = run(first, opening(first, 'conn_other', other))
    const otherGrant = lastSync(withOther.effects)
    const disposed = run(withOther.state, {type: 'disposed'})
    expect(disposed.effects).toContainEqual({type: 'close-attachment', attempt: 1, outcome: 'closed'})
    expect(disposed.effects).toContainEqual({type: 'close-attachment', attempt: 3, outcome: 'closed'})
    expect(disposed.effects).not.toContainEqual({type: 'notify-drained'})
    expect(PageMachine.selectTarget(disposed.state, sessionId, undefined).ok).toBe(false)
    expect(PageMachine.isAttachedConnection(disposed.state, sessionId, 'conn_1')).toBe(false)

    const revoke = lastSync(disposed.effects)
    const firstDone = run(disposed.state, synced(revoke.attempt))
    expect(firstDone.effects).toEqual([])

    const otherSettled = run(firstDone.state, synced(otherGrant.attempt, other))
    const otherRevoke = lastSync(otherSettled.effects)
    expect(otherRevoke).toMatchObject({sessionId: other, allow: false})
    expect(otherSettled.effects).not.toContainEqual({type: 'notify-drained'})

    const drained = run(otherSettled.state, synced(otherRevoke.attempt, other))
    expect(drained.effects).toEqual([{type: 'notify-drained'}])
    expect(drained.state.sessions.size).toBe(0)
  })

  it('a disposed plugin rejects requests and ignores attachments', () => {
    const disposed = run(PageMachine.createConnectionState(), {type: 'disposed'}).state
    expect(PageMachine.selectTarget(disposed, sessionId, undefined)).toMatchObject({
      ok: false,
      error: {message: expect.stringContaining('[page.disconnected]')},
    })
    const late = PageMachine.transitionConnection(disposed, opening(disposed, 'conn_1'))
    expect(late.state).toBe(disposed)
    expect(late.effects).toEqual([])
  })
})

describe('page queue: where it started', () => {
  it('a finished chat queue is owed until claimed, a settle to nextReply hands it to the next reply once, and queue.wait still delivers it', async () => {
    const finished = Promise.withResolvers<void>()
    const queues = PageQueue.fromPlay({
      play: (_sessionId, play) =>
        play.actions.map(async () => ({ok: true as const, result: {value: {ok: true}, files: []}})),
      journal: async () => {},
      finished: () => finished.resolve(),
    })
    const action = Page.Action.parse({
      type: 'queue_async',
      actions: [
        {tool: 'page_fill', selector: '#a', value: 'Ada'},
        {tool: 'page_click', selector: '#go'},
      ],
    })
    if (action.type !== 'queue_async') throw new Error('the action is not a queue')
    const {queueId} = queues.start(sessionId, {agentId: 'build', action, toolCallId: 'q1'})
    await finished.promise
    const offered = queues.owed(sessionId, [], false)
    const result = offered[0]?.result
    expect(result).toMatchObject({queueId, status: 'finished', played: 2, failed: 0})
    const owed = [{queueId, toolCallId: 'q1', result, before: 'owed'}]
    expect(offered).toEqual(owed)
    expect(queues.undelivered(sessionId, {excludeToolCallIds: ['q1']})).toEqual([])
    expect(queues.owed(sessionId, [], true)).toEqual(owed)
    queues.settle(sessionId, [queueId], 'nextReply')
    expect(queues.undelivered(sessionId, {toolCallIds: ['q1']})).toEqual([result])
    expect(queues.undelivered(sessionId, {toolCallIds: ['q1']})).toEqual([])
    expect(await queues.wait(sessionId, queueId, 0)).toEqual(result)
  })

  it('queue.claim hands a finished result over claimed, a settle back leaves it owed, and a result already claimed or delivered is handed over with nothing claimed', async () => {
    const finished = Promise.withResolvers<void>()
    const queues = PageQueue.fromPlay({
      play: (_sessionId, play) =>
        play.actions.map(async () => ({ok: true as const, result: {value: {ok: true}, files: []}})),
      journal: async () => {},
      finished: () => finished.resolve(),
    })
    const action = Page.Action.parse({type: 'queue_async', actions: [{tool: 'page_click', selector: '#go'}]})
    if (action.type !== 'queue_async') throw new Error('the action is not a queue')
    const {queueId} = queues.start(sessionId, {agentId: 'build', action, toolCallId: 'hub-call'})
    await finished.promise
    const claimed = await queues.claim(sessionId, queueId, 0)
    if (!('result' in claimed)) throw new Error('the queue did not finish')
    expect(claimed).toEqual({result: expect.objectContaining({queueId, status: 'finished'}), before: 'owed'})
    expect(queues.owed(sessionId, [], false)).toEqual([])
    expect(await queues.claim(sessionId, queueId, 0)).toEqual({result: claimed.result, before: null})
    queues.settle(sessionId, [queueId], 'owed')
    expect(queues.owed(sessionId, [], false)).toEqual([
      {queueId, toolCallId: 'hub-call', result: claimed.result, before: 'owed'},
    ])
    expect(await queues.claim(sessionId, queueId, 0)).toEqual({result: claimed.result, before: 'owed'})
    queues.settle(sessionId, [queueId], 'delivered')
    expect(queues.owed(sessionId, [], false)).toEqual([])
    expect(await queues.claim(sessionId, queueId, 0)).toEqual({result: claimed.result, before: null})
  })

  it('a deleted session drops its queues: a result landing after the delete is never announced or owed, and waiting on it answers no queue', async () => {
    const finished: string[] = []
    const keptAnnounced = Promise.withResolvers<void>()
    const landing = Promise.withResolvers<{ok: true; result: {value: {ok: boolean}; files: []}}>()
    const queues = PageQueue.fromPlay({
      play: (_sessionId, play) => play.actions.map(() => landing.promise),
      journal: async () => {},
      finished: (record) => {
        finished.push(record.queueId)
        if (record.sessionId === other) keptAnnounced.resolve()
      },
    })
    const action = Page.Action.parse({type: 'queue_async', actions: [{tool: 'page_click', selector: '#go'}]})
    if (action.type !== 'queue_async') throw new Error('the action is not a queue')
    const playing = queues.start(sessionId, {agentId: 'build', action, toolCallId: 'deleted-call'})
    const kept = queues.start(other, {agentId: 'build', action, toolCallId: 'kept-call'})
    queues.cancelSession(sessionId)
    landing.resolve({ok: true, result: {value: {ok: true}, files: []}})
    await keptAnnounced.promise
    expect(await queues.wait(other, kept.queueId, 0)).toMatchObject({queueId: kept.queueId, status: 'finished'})
    expect(finished).toEqual([kept.queueId])
    expect(queues.owed(sessionId, [], false)).toEqual([])
    expect(queues.startedBy(sessionId, ['deleted-call'])).toEqual([])
    await expect(queues.wait(sessionId, playing.queueId, 0)).rejects.toThrow(`no queue ${playing.queueId} on this tab`)
  })

  it('a queued action whose command never reached the page counts as lost, not played', async () => {
    const message =
      '[page.not_dispatched] Could not dispatch page.click; it did not run. Check that the page is open and call page.tabs.list({}) before deciding whether to retry.'
    const notDispatched: PageQueue.RequestSettlement = {ok: false, error: Tool.toolError({message})}
    const queues = PageQueue.fromPlay({
      play: (_sessionId, play) => play.actions.map(async () => notDispatched),
      journal: async () => {},
      finished: () => {},
    })
    const action = Page.Action.parse({type: 'queue', actions: [{tool: 'page_click', selector: '#go'}]})
    if (action.type !== 'queue') throw new Error('the action is not a queue')
    expect(await queues.play(sessionId, {agentId: 'build', action, toolCallId: 'undispatched'})).toMatchObject({
      status: 'lost',
      played: 0,
      failed: 0,
      outcomes: [{index: 0, tool: 'page_click', ok: false, error: expect.stringContaining('Could not dispatch')}],
    })
  })
})

describe('page queue: plays and owes', () => {
  type Held = PromiseWithResolvers<PageQueue.RequestSettlement>

  function heldPage(syncMs?: number) {
    const replies: Held[][] = []
    const landed = new EventTarget()
    const queues = PageQueue.fromPlay({
      play: (_sessionId, play) => {
        const held = play.actions.map(() => Promise.withResolvers<PageQueue.RequestSettlement>())
        replies.push(held)
        return held.map((each) => each.promise)
      },
      journal: async () => {},
      finished: (record) => landed.dispatchEvent(new Event(record.queueId)),
      ...(syncMs === undefined ? {} : {syncMs}),
    })
    const finished = (queueId: string): Promise<void> =>
      new Promise((resolve) => landed.addEventListener(queueId, () => resolve(), {once: true}))
    return {queues, replies, finished}
  }

  const checked = (value: Record<string, string | boolean>): PageQueue.RequestSettlement => ({
    ok: true,
    result: {value, files: []},
  })

  function checks(type: 'queue' | 'queue_async', selectors: string[]) {
    const action = Page.Action.parse({type, actions: selectors.map((selector) => ({tool: 'page_check', selector}))})
    if (action.type !== 'queue' && action.type !== 'queue_async') throw new Error('the action is not a queue')
    return {agentId: 'build', action, toolCallId: 'call-1'}
  }

  it('keeps each reply for its own action, counts an unconfirmed one as lost, and owes only what no caller took', async () => {
    const {queues, replies, finished} = heldPage(20)
    const {queueId} = queues.start(sessionId, checks('queue_async', ['#first', '#second', '#third']))
    const landing = finished(queueId)
    const [first, second, third] = replies[0] ?? []
    second?.resolve(checked({checked: '#second'}))
    third?.resolve(checked({checked: '#third'}))
    first?.resolve(checked({checked: '#first'}))
    await landing
    expect(await queues.wait(sessionId, queueId, 0)).toEqual({
      queueId,
      status: 'finished',
      outcomes: ['#first', '#second', '#third'].map((selector, index) => ({
        index,
        tool: 'page_check',
        ok: true,
        result: {checked: selector},
      })),
      failed: 0,
      played: 3,
    })

    const unconfirmed = queues.start(sessionId, checks('queue_async', ['#name', '#agree']))
    const unconfirmedLanding = finished(unconfirmed.queueId)
    replies[1]?.[0]?.resolve(checked({value: 'Ada'}))
    replies[1]?.[1]?.resolve({
      ok: false,
      error: Tool.toolError({message: '[page.timeout] page.check did not finish within 1 seconds'}),
    })
    await unconfirmedLanding
    expect(await queues.wait(sessionId, unconfirmed.queueId, 0)).toEqual({
      queueId: unconfirmed.queueId,
      status: 'lost',
      outcomes: [
        {index: 0, tool: 'page_check', ok: true, result: {value: 'Ada'}},
        {
          index: 1,
          tool: 'page_check',
          ok: false,
          error: 'the page did not confirm page_check in time; it may already have run',
        },
      ],
      failed: 0,
      played: 1,
    })

    const outlasting = await queues.play(sessionId, checks('queue', ['#first', '#second']))
    const readQueueId = (result: unknown): string => z.object({queueId: z.string()}).parse(result).queueId
    const outlastingId = readQueueId(outlasting)
    expect(outlasting).toEqual({queueId: outlastingId, status: 'playing', done: 0, of: 2})
    expect(queues.startedBy(sessionId, ['call-1'])).toEqual([{queueId: outlastingId, actions: 2}])
    const outlastingLanding = finished(outlastingId)
    replies[2]?.forEach((reply) => reply.resolve(checked({})))
    await outlastingLanding
    expect(queues.startedBy(sessionId, ['call-1'])).toEqual([])
    expect(queues.undelivered(sessionId, {toolCallIds: ['call-1']})).toEqual([
      expect.objectContaining({queueId: outlastingId, status: 'finished', played: 2}),
    ])
    expect(queues.undelivered(sessionId, {toolCallIds: ['call-1']})).toEqual([])

    const inCall = queues.play(sessionId, checks('queue', ['#agree']))
    await Promise.resolve()
    replies[3]?.[0]?.resolve(checked({checked: true}))
    const inCallId = readQueueId(await inCall)
    expect(await queues.claim(sessionId, inCallId, 0)).toMatchObject({before: null})
    expect(queues.owed(sessionId, [], false)).toEqual([])
  })

  it('a result a claim holds outlives two hundred delivered queues and a deleted session puts nothing back', async () => {
    const {queues, replies, finished} = heldPage()
    const played = async (): Promise<string> => {
      const {queueId} = queues.start(sessionId, checks('queue_async', ['#agree']))
      const landing = finished(queueId)
      replies.at(-1)?.[0]?.resolve(checked({checked: true}))
      await landing
      return queueId
    }
    const held = await played()
    expect(await queues.claim(sessionId, held, 0)).toMatchObject({before: 'owed'})
    for (const _ of Array.from({length: 205})) await queues.wait(sessionId, await played(), 0)
    queues.settle(sessionId, [held], 'owed')
    expect(queues.owed(sessionId, [], false).map((queue) => queue.queueId)).toEqual([held])

    expect(await queues.claim(sessionId, held, 0)).toMatchObject({before: 'owed'})
    queues.cancelSession(sessionId)
    queues.settle(sessionId, [held], 'owed')
    expect(queues.owed(sessionId, [], false)).toEqual([])
    await expect(queues.wait(sessionId, held, 0)).rejects.toThrow(`no queue ${held} on this tab`)
  })

  it('at a thousand owed results a new queue is refused before it plays, and delivering one frees a place', async () => {
    const {queues, replies, finished} = heldPage()
    const started: string[] = []
    for (const _ of Array.from({length: 1000})) {
      const {queueId} = queues.start(sessionId, checks('queue_async', ['#agree']))
      const landing = finished(queueId)
      replies.at(-1)?.[0]?.resolve(checked({checked: true}))
      await landing
      started.push(queueId)
    }
    expect(() => queues.start(sessionId, checks('queue_async', ['#agree']))).toThrow(
      '1000 queue results are still undelivered; collect them before queueing more',
    )
    expect(replies).toHaveLength(1000)
    expect(await queues.wait(sessionId, started[0] ?? '', 0)).toMatchObject({queueId: started[0], status: 'finished'})
    const freed = queues.start(sessionId, checks('queue_async', ['#agree']))
    expect(replies).toHaveLength(1001)
    expect(queues.owed(sessionId, [], false).map((queue) => queue.queueId)).toEqual(started.slice(1))
    expect(freed.actions).toBe(1)
  })
})

describe('page tools', () => {
  it('saved capture names never escape their directory or name a Windows device', async () => {
    const file = (name: string): Page.File => ({
      id: Page.FileId.parse(`file_${crypto.randomUUID()}`),
      name,
      mime: 'text/plain',
      data: new TextEncoder().encode(name),
    })
    const PageFiles = await import('../src/files.js')
    const root = tempDir('conciv-page-')
    const saved = await Effect.runPromise(
      PageFiles.save([file('..'), file('.'), file('CON.txt'), file('lpt1'), file('report.html')], root),
    )
    const screenshots = join('.conciv', 'tmp', 'screenshots')
    expect(saved.map((capture) => dirname(capture.path))).toEqual(saved.map(() => screenshots))
    expect(saved.map((capture) => extname(capture.path))).toEqual(['', '', '', '', '.html'])
    expect(saved.map((capture) => capture.name)).toEqual(['..', '.', 'CON.txt', 'lpt1', 'report.html'])
    expect(await readFile(join(root, saved[0]?.path ?? ''), 'utf8')).toBe('..')
  })
})

async function chunkWithInlineMap(source: string, line: number, column: number): Promise<string> {
  const gen = new GenMapping()
  addMapping(gen, {generated: {line: 2, column: 0}, source, original: {line, column}})
  const b64 = Buffer.from(JSON.stringify(toEncodedMap(gen))).toString('base64')
  const path = join(tempDir('conciv-chunk-'), 'chunk.js')
  await writeFile(path, `"use strict";\nvoid 0;\n//# sourceMappingURL=data:application/json;base64,${b64}`)
  return path
}

describe('symbolicate', () => {
  it('reads a React server frame, fetches a loopback http frame, and never fetches another host', async () => {
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const fetched: string[] = []
    const fakeFetch: typeof fetch = async (input) => {
      fetched.push(String(input))
      return new Response(readFileSync(chunk, 'utf8'))
    }
    const at = (fileName: string) => symbolicateFrame({fileName, line: 2, column: 1}, tmpdir(), fakeFetch)
    expect((await at(`about://React/Server/file://${chunk}?42`))?.file).toBe('app/page.tsx')
    expect((await at('http://localhost:3000/src/App.tsx?x=1'))?.file).toBe('app/page.tsx')
    expect(await at('http://169.254.169.254/latest/meta-data')).toBeNull()
    expect(fetched.some((url) => url.includes('169.254'))).toBe(false)
  })

  it('answers null for a frame with no fileName and reads nothing', async () => {
    const fetched: string[] = []
    const fakeFetch: typeof fetch = async (input) => {
      fetched.push(String(input))
      return new Response('')
    }
    expect(await symbolicateFrame({line: 2, column: 1}, tmpdir(), fakeFetch)).toBeNull()
    expect(fetched).toEqual([])
  })
})
