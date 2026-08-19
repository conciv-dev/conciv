import {afterEach, describe, expect, it} from 'vitest'
import {tmpdir} from 'node:os'
import {makeApprovingCallTool, type Kit} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'
import {connectWidget, type FakeWidget} from '../../helpers/fake-widget.js'

describe('a page tool call reaches only the widget subscribed to the calling session', () => {
  const widgets: FakeWidget[] = []
  const state: {kit: Kit | undefined} = {kit: undefined}

  afterEach(async () => {
    for (const widget of widgets.splice(0)) widget.end()
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
  })

  it('a mutation from session A never reaches the widget subscribed to session B', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    const sessionA = await kit.session()
    const sessionB = await kit.session()
    expect(sessionA).not.toBe(sessionB)

    const widgetA = await connectWidget(kit, sessionA, () => ({ok: true, result: {ok: true, value: 'from-a'}}))
    const widgetB = await connectWidget(kit, sessionB, () => ({ok: true, result: {ok: true, value: 'from-b'}}))
    widgets.push(widgetA, widgetB)

    const callA = makeApprovingCallTool(kit.base, sessionA)
    const result = await callA('page.fill', {selector: '#email', value: 'a@b.c'})

    expect(result).toEqual({ok: true, value: 'from-a'})
    expect(widgetA.seen()).toEqual(['page.fill'])
    expect(widgetB.seen()).toEqual([])
  }, 30_000)

  it('a later subscription for the same session replaces the earlier one instead of racing it', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    const session = await kit.session()

    const stale = await connectWidget(kit, session, () => ({ok: true, result: {ok: true, value: 'stale'}}))
    const fresh = await connectWidget(kit, session, () => ({ok: true, result: {ok: true, value: 'fresh'}}))
    widgets.push(stale, fresh)

    const call = makeApprovingCallTool(kit.base, session)
    const result = await call('page.fill', {selector: '#email', value: 'a@b.c'})

    expect(result).toEqual({ok: true, value: 'fresh'})
    expect(fresh.seen()).toEqual(['page.fill'])
    expect(stale.seen()).toEqual([])
  }, 30_000)

  it('a call for a session with no subscriber fails honestly instead of falling back to another tab', async () => {
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    const sessionA = await kit.session()
    const sessionB = await kit.session()

    const widgetB = await connectWidget(kit, sessionB, () => ({ok: true, result: {ok: true, value: 'from-b'}}))
    widgets.push(widgetB)

    const callA = makeApprovingCallTool(kit.base, sessionA)
    await expect(callA('page.fill', {selector: '#email', value: 'a@b.c'})).rejects.toThrow(/no widget connected/)
    expect(widgetB.seen()).toEqual([])
  }, 30_000)
})
