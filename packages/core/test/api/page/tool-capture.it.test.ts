import {afterEach, describe, expect, it} from 'vitest'
import {tmpdir} from 'node:os'
import type {PageOutcome} from '@conciv/protocol/page-types'
import type {ElementCapture, ElementCaptureKind} from '@conciv/protocol/element-capture-types'
import {makeCallTool, type Kit} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'
import {connectWidget} from '../../helpers/fake-widget.js'

const SECRET = 'hunter2-never-leaves-the-page'

type CapturingKit = {kit: Kit; sessionId: string; call: (name: string, input: unknown) => Promise<unknown>}

describe('an element capture is stored beside the transcript and never reaches the model', () => {
  const state: {kit: Kit | undefined; widget: {end: () => void} | undefined} = {kit: undefined, widget: undefined}

  afterEach(async () => {
    state.widget?.end()
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    state.widget = undefined
  })

  function side(kind: ElementCaptureKind): ElementCapture {
    return {
      kind,
      ts: 1,
      descriptor: {tagName: 'input', selectorPath: '#email', role: 'textbox', value: '***'},
      node: {type: 2, tagName: 'input', attributes: {value: '***'}, childNodes: [], id: 7},
      cssBundleId: 'csstest1',
    }
  }

  function answerFor(): PageOutcome {
    return {
      ok: true,
      result: {ok: true, value: '***'},
      capture: {
        before: side('before'),
        after: side('after'),
        cssBundles: [{hash: 'csstest1', css: '.form input {color: red}'}],
      },
    }
  }

  async function bootCapturing(): Promise<CapturingKit> {
    const kit = await bootKit({cwd: tmpdir()})
    state.kit = kit
    state.widget = await connectWidget(kit, answerFor)
    const sessionId = await kit.session()
    return {kit, sessionId, call: makeCallTool(kit.base, sessionId)}
  }

  it('keeps the capture out of everything the harness is handed', async () => {
    const {call} = await bootCapturing()
    const result = await call('page.fill', {selector: '#email', value: SECRET})
    expect(JSON.stringify(result)).not.toContain('cssBundleId')
    expect(JSON.stringify(result)).not.toContain('selectorPath')
    expect(JSON.stringify(result)).not.toContain(SECRET)
  }, 90_000)

  it('stores both capture sides under the tool call id the agent minted', async () => {
    const {kit, sessionId, call} = await bootCapturing()
    await call('page.fill', {selector: '#email', value: SECRET})

    const stored = await kit.rpc.captures.list({sessionId})
    expect(stored.captures.map((row) => row.kind).toSorted()).toEqual(['after', 'before'])
    const ids = new Set(stored.captures.map((row) => row.toolCallId))
    expect(ids.size).toBe(1)
    expect([...ids][0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(stored.cssBundles['csstest1']).toBe('.form input {color: red}')
  }, 90_000)

  it('drops a session capture and its unreferenced css bundle when the session is deleted', async () => {
    const {kit, sessionId, call} = await bootCapturing()
    await call('page.fill', {selector: '#email', value: SECRET})
    await kit.rpc.sessions.delete({sessionId})
    const stored = await kit.rpc.captures.list({sessionId})
    expect(stored.captures).toEqual([])
    expect(stored.cssBundles).toEqual({})
  }, 90_000)
})
