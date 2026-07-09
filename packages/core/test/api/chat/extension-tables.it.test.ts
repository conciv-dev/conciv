import {describe, expect, it} from 'vitest'
import {defineExtension} from '@conciv/extension'
import {startTestEngine} from '../../helpers/state-plane.js'

const demo = defineExtension({
  name: 'demo',
  tables: [
    {name: 'notes', columns: `session_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT ''`},
    {name: 'labels', columns: 'text TEXT NOT NULL'},
  ],
})

describe('engine extension tables', () => {
  it('serves record apis for every declared extension table', async () => {
    const engine = await startTestEngine({extensions: [demo]})
    const notes = await fetch(`http://127.0.0.1:${engine.statePort}/api/records/v1/ext_demo_notes`)
    const labels = await fetch(`http://127.0.0.1:${engine.statePort}/api/records/v1/ext_demo_labels`)
    expect(notes.status).toBe(200)
    expect(labels.status).toBe(200)
    expect(await notes.json()).toEqual({total_count: 0, records: []})
    await engine.stop()
  }, 120000)
})
