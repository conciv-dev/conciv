import {z} from 'zod'
import {expect, test} from 'vitest'
import type {LiveDb, ServerCollection} from '@mandarax/protocol/db-types'
import type {SyncEngine} from '@mandarax/protocol/sync-types'
import {collectServerContributions, defineExtension, defineTool} from '../src/index.js'

function recordingDb(declared: string[]): LiveDb {
  return {
    collection: <T extends {cid: string}>(name: string): ServerCollection<T> => {
      declared.push(name)
      return {
        name,
        recordApiName: name,
        query: async () => [],
        insert: async (row: T) => row,
        update: async () => {
          throw new Error('test double: update unused')
        },
        delete: async () => {},
      }
    },
    list: () => [],
    get: () => null,
  }
}

const sync: SyncEngine = {
  room: () => {
    throw new Error('test double: sync.room unused')
  },
}

test('collectServerContributions threads services and collects handlers + policies + tools', () => {
  const declared: string[] = []
  let started = false
  const ext = defineExtension({id: 'probe'}).server((mx) => {
    mx.db.collection('probe_notes', {schema: z.object({cid: z.string()}), columns: 'body TEXT'})
    mx.on('session_start', () => void (started = true))
    mx.approval('probe.del', 'ask')
    mx.registerTool(
      defineTool({
        name: 'probe.add',
        label: 'Add',
        description: 'add a probe note',
        parameters: z.object({cid: z.string()}),
        execute: async (input) => input,
      }),
    )
  })

  const out = collectServerContributions([ext], {db: recordingDb(declared), sync})

  expect(declared).toContain('probe_notes')
  expect(out.approvalPolicies['probe.del']).toBe('ask')
  expect(out.eventHandlers.session_start.length).toBe(1)
  out.eventHandlers.session_start[0]?.({sessionId: 's', previewId: 'p'})
  expect(started).toBe(true)
  expect(out.tools.map((t) => t.name)).toContain('probe.add')
})

test('mx.db throws a clear error when services are not wired', () => {
  const ext = defineExtension({id: 'unwired'}).server((mx) => {
    mx.db.collection('x', {schema: z.object({cid: z.string()}), columns: 'body TEXT'})
  })
  expect(() => collectServerContributions([ext])).toThrow(/mx.db/)
})
