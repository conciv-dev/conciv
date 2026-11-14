import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {PAGE_TOOL_DEFS, pageVerbOfTool} from '@conciv/extension-page/defs'
import {SessionId} from '@conciv/protocol/chat-types'
import * as PageMachine from '../src/page/machine.js'
import * as Page from '../src/page/rpc.js'
import * as PageSkill from '../src/page/skill.js'

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
  const operation = Page.Operations.find((candidate) => candidate.name === pageVerbOfTool(definition.name))
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
    expect(decode({type: 'attached', connectionId: 'client', version: 1})).toEqual({
      type: 'attached',
      connectionId: 'client',
      version: 1,
    })
    expect(z.parse(Page.Definition.methods.attach.output, 'replaced')).toBe('replaced')
  })

  it('page ID patterns survive JSON Schema export for model tool definitions', () => {
    expect(exported(Page.TabId)).toMatchObject({type: 'string', pattern: '^tab_[a-f0-9-]{36}$'})
    expect(exported(Page.FileId)).toMatchObject({type: 'string', pattern: '^file_[a-f0-9-]{36}$'})
  })

  it.each(PAGE_TOOL_DEFS.map(pairWithOperation))(
    '%s keeps its input and output schema, mutating and capture as an operation',
    (_name, definition, operation) => {
      expect(withoutTab(operation.input)).toEqual(exported(definition.inputSchema))
      expect(exported(operation.output)).toEqual(exported(definition.outputSchema ?? z.null()))
      expect([operation.mutating, operation.capture]).toEqual([definition.meta?.mutating, definition.meta?.capture])
    },
  )

  it('the operations are the page tools plus tabs.list', () => {
    expect(Page.Operations.map((operation) => operation.name).toSorted()).toEqual(
      ['tabs.list', ...PAGE_TOOL_DEFS.map((definition) => pageVerbOfTool(definition.name))].toSorted(),
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
const command: Page.Command = {action: {type: 'tabs.list'}, agentId: 'agent', timeoutMs: 5000}
const success = z.parse(Page.Outcome, {type: 'success', result: {value: {ok: true}, files: []}})
const failure = z.parse(Page.Outcome, {type: 'failure', code: 'navigation', message: 'Blocked'})

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

function settlements(effects: readonly PageMachine.ConnectionEffect[]) {
  return effects.flatMap((effect) => (effect.type === 'settle-request' ? [effect.settlement] : []))
}

function message(settlement: PageMachine.RequestSettlement | undefined) {
  return settlement?.ok === false ? settlement.error.message : undefined
}

function attached(connectionId = 'conn_1') {
  const initial = PageMachine.createConnectionState()
  const first = run(initial, opening(initial, connectionId))
  return run(first.state, synced(lastSync(first.effects).attempt)).state
}

function started(requestId: string, connectionId = 'conn_1'): MachineEvent {
  return {type: 'request.started', sessionId, connectionId, requestId, command}
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
    expect(PageMachine.selectTarget(closed.state, sessionId, {type: 'route'})).toMatchObject({
      ok: true,
      connectionId: 'conn_2',
    })
  })

  it('a tab that attaches again replaces its own earlier attachment', () => {
    const live = run(attached(), started('req_1'))
    const again = run(live.state, opening(live.state, 'conn_1'))
    expect(message(settlements(again.effects)[0])).toContain('the action may already have run')
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
    expect(PageMachine.selectTarget(first.state, sessionId, {type: 'tabs.list'})).toMatchObject({
      ok: false,
      error: {message: expect.stringContaining('still connecting')},
    })

    const early = PageMachine.transitionConnection(first.state, started('req_1'))
    expect(early.state).toBe(first.state)
    expect(early.effects).toEqual([
      {type: 'settle-request', requestId: 'req_1', settlement: {ok: false, error: expect.anything()}},
    ])

    const report = PageMachine.transitionConnection(first.state, reported('conn_1', tab))
    expect(report.state).toBe(first.state)

    const done = run(first.state, synced(lastSync(first.effects).attempt))
    expect(controls(done.effects)).toEqual([{type: 'attached', connectionId: 'conn_1', version: 1}])
    expect(PageMachine.selectTarget(done.state, sessionId, {type: 'tabs.list'})).toMatchObject({
      ok: true,
      connectionId: 'conn_1',
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

  it('a request for a tab that closed after the tool selected it is never sent', () => {
    const first = attached()
    const both = run(first, opening(first, 'conn_2')).state
    expect(PageMachine.selectTarget(both, sessionId, {type: 'route'})).toMatchObject({ok: true})
    const closed = run(both, {type: 'attach.closed', sessionId, attempt: 1}).state

    const late = PageMachine.transitionConnection(closed, started('req_1', 'conn_1'))
    expect(late.state).toBe(closed)
    expect(late.effects).toHaveLength(1)
    expect(message(settlements(late.effects)[0])).toContain('no action ran')
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

describe('page machine: requests', () => {
  const live = () => run(attached(), started('req_1'))

  it('a started request dispatches once and keeps its command for the page', () => {
    const next = live()
    expect(next.effects).toEqual([{type: 'dispatch-command', sessionId, connectionId: 'conn_1', requestId: 'req_1'}])
    expect(PageMachine.selectPendingCommand(next.state, sessionId, 'conn_1', 'req_1')).toBe(command)
    expect(PageMachine.selectPendingCommand(next.state, sessionId, 'conn_2', 'req_1')).toBeUndefined()
  })

  it.each([
    {outcome: success, expected: {ok: true, result: {value: {ok: true}, files: []}}},
    {outcome: failure, expected: {ok: false, error: expect.objectContaining({message: '[page.navigation] Blocked'})}},
  ])('a result settles the request ($outcome.type)', ({outcome, expected}) => {
    const next = run(live().state, {
      type: 'request.settled',
      sessionId,
      connectionId: 'conn_1',
      requestId: 'req_1',
      outcome,
    })
    expect(next.effects).toEqual([{type: 'settle-request', requestId: 'req_1', settlement: expected}])
    expect(PageMachine.selectPendingCommand(next.state, sessionId, 'conn_1', 'req_1')).toBeUndefined()
  })

  it('a failed dispatch settles without a cancel', () => {
    const next = run(live().state, {
      type: 'request.dispatch-failed',
      sessionId,
      connectionId: 'conn_1',
      requestId: 'req_1',
      error: new Error('bus closed'),
    })
    expect(controls(next.effects)).toEqual([])
    expect(message(settlements(next.effects)[0])).toContain('Could not dispatch page.tabs.list')
  })

  it('a timeout settles with the call timeout and cancels on the page', () => {
    const next = run(live().state, {type: 'request.timed-out', sessionId, connectionId: 'conn_1', requestId: 'req_1'})
    expect(message(settlements(next.effects)[0])).toContain(
      '[page.timeout] page.tabs.list did not finish within 5 seconds',
    )
    expect(controls(next.effects)).toEqual([{type: 'cancel', connectionId: 'conn_1', requestId: 'req_1'}])
  })

  it('an interrupted caller cancels on the page without a settlement', () => {
    const next = run(live().state, {type: 'request.cancelled', sessionId, connectionId: 'conn_1', requestId: 'req_1'})
    expect(next.effects).toEqual([
      {type: 'emit-control', control: {type: 'cancel', connectionId: 'conn_1', requestId: 'req_1'}},
    ])
  })

  it('a close fails pending requests as possibly run, without a cancel', () => {
    const next = run(live().state, {type: 'attach.closed', sessionId, attempt: 1})
    expect(controls(next.effects)).toEqual([])
    expect(message(settlements(next.effects)[0])).toContain('the action may already have run')
  })

  it('late results after a settlement change nothing', () => {
    const target = {sessionId, connectionId: 'conn_1', requestId: 'req_1'}
    const settled = run(live().state, {type: 'request.settled', ...target, outcome: success}).state
    const late: MachineEvent[] = [
      {type: 'request.settled', ...target, outcome: success},
      {type: 'request.timed-out', ...target},
      {type: 'request.cancelled', ...target},
      {type: 'request.dispatch-failed', ...target, error: undefined},
    ]
    for (const event of late) {
      const next = PageMachine.transitionConnection(settled, event)
      expect(next.state).toBe(settled)
      expect(next.effects).toEqual([])
    }
  })
})

describe('page machine: tab state', () => {
  it('a tab ID resolves to the tab that reported it, a call without one goes to the tab focused last', () => {
    const second = `tab_${crypto.randomUUID()}`
    const first = attached()
    const both = run(first, opening(first, 'conn_2')).state
    const stale = PageMachine.transitionConnection(both, {...reported('conn_9', tab)})
    expect(stale.state).toBe(both)
    expect(PageMachine.selectTarget(both, sessionId, {type: 'route', tabId})).toMatchObject({
      ok: false,
      error: {message: expect.stringContaining('[page.tab_unavailable]')},
    })
    expect(PageMachine.selectTarget(both, sessionId, {type: 'route'})).toMatchObject({connectionId: 'conn_2'})

    const focusedFirst = run(
      both,
      reported('conn_2', {...tab, id: second, focused: false}),
      reported('conn_1', tab),
    ).state
    expect(PageMachine.selectTarget(focusedFirst, sessionId, {type: 'route', tabId: second})).toMatchObject({
      connectionId: 'conn_2',
    })
    expect(PageMachine.selectTarget(focusedFirst, sessionId, {type: 'route'})).toMatchObject({
      ok: true,
      connectionId: 'conn_1',
      tab,
    })
    expect(PageMachine.selectTabs(focusedFirst, sessionId)).toEqual({
      tabs: [tab, {...tab, id: second, focused: false}],
      focusedTabId: tabId,
    })

    const blurred = run(focusedFirst, reported('conn_1', {...tab, focused: false})).state
    expect(PageMachine.selectTarget(blurred, sessionId, {type: 'route'})).toMatchObject({connectionId: 'conn_1'})
    const focusedSecond = run(blurred, reported('conn_2', {...tab, id: second, focused: true})).state
    expect(PageMachine.selectTarget(focusedSecond, sessionId, {type: 'route'})).toMatchObject({
      connectionId: 'conn_2',
    })
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
    expect(PageMachine.selectTarget(disposed.state, sessionId, {type: 'tabs.list'}).ok).toBe(false)
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
    const request = PageMachine.transitionConnection(disposed, started('req_1'))
    expect(request.state).toBe(disposed)
    expect(message(settlements(request.effects)[0])).toContain('no action ran')
    const late = PageMachine.transitionConnection(disposed, opening(disposed, 'conn_1'))
    expect(late.state).toBe(disposed)
    expect(late.effects).toEqual([])
  })
})
