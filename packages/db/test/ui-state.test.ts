import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {openDb} from '../src/db.js'
import {makeUiState} from '../src/ui-state.js'

const make = () => makeUiState(openDb(mkdtempSync(join(tmpdir(), 'conciv-ui-'))), () => 7)

describe('ui-state', () => {
  it('draft get is null until set, then upserts', async () => {
    const ui = make()
    expect(await ui.getDraft('s1')).toBeNull()
    await ui.setDraft({sessionId: 's1', text: 'a', selectionStart: 1, selectionEnd: 1, grabs: []})
    await ui.setDraft({sessionId: 's1', text: 'ab', selectionStart: 2, selectionEnd: 2, grabs: []})
    expect((await ui.getDraft('s1'))?.text).toBe('ab')
  })

  it('clearDraft removes the row', async () => {
    const ui = make()
    await ui.setDraft({sessionId: 's1', text: 'a', selectionStart: 0, selectionEnd: 0, grabs: ['<x/>']})
    await ui.clearDraft('s1')
    expect(await ui.getDraft('s1')).toBeNull()
  })

  it('markers append and list per session', async () => {
    const ui = make()
    await ui.addMarker({sessionId: 's1', afterTurn: 0, kind: 'new'})
    await ui.addMarker({sessionId: 's1', afterTurn: 4, kind: 'compact'})
    await ui.addMarker({sessionId: 's2', afterTurn: 1, kind: 'new'})
    const listed = await ui.listMarkers('s1')
    expect(listed.map((marker) => marker.kind)).toEqual(['new', 'compact'])
  })

  it('deleteFor removes drafts and markers of one session only', async () => {
    const ui = make()
    await ui.setDraft({sessionId: 's1', text: 'a', selectionStart: 0, selectionEnd: 0, grabs: []})
    await ui.addMarker({sessionId: 's1', afterTurn: 0, kind: 'new'})
    await ui.addMarker({sessionId: 's2', afterTurn: 0, kind: 'new'})
    await ui.deleteFor('s1')
    expect(await ui.getDraft('s1')).toBeNull()
    expect(await ui.listMarkers('s1')).toEqual([])
    expect((await ui.listMarkers('s2')).length).toBe(1)
  })

  it('watch fires on draft and marker writes', async () => {
    const ui = make()
    let hits = 0
    ui.watch(() => {
      hits += 1
    })
    await ui.setDraft({sessionId: 's1', text: '', selectionStart: 0, selectionEnd: 0, grabs: []})
    await ui.addMarker({sessionId: 's1', afterTurn: 0, kind: 'new'})
    expect(hits).toBe(2)
  })
})
