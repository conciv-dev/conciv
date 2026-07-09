import {describe, expect, expectTypeOf, it} from 'vitest'
import {TABLES, type DraftRow, type MarkerRow, type RowFor, type SessionRow} from './rows.js'
import type {RecordsClient} from './server/records.js'

describe('table registry', () => {
  it('pins registry row types to the exported row types', () => {
    expectTypeOf<RowFor<'sessions'>>().toEqualTypeOf<SessionRow>()
    expectTypeOf<RowFor<'drafts'>>().toEqualTypeOf<DraftRow>()
    expectTypeOf<RowFor<'markers'>>().toEqualTypeOf<MarkerRow>()
  })

  it('covers every core table', () => {
    expect(Object.keys(TABLES).toSorted()).toEqual(['drafts', 'markers', 'sessions'])
  })

  it('rejects unknown tables and columns at compile time', () => {
    const compileOnly = (client: RecordsClient) => {
      // @ts-expect-error unknown table name
      void client.list('nope')
      // @ts-expect-error unknown filter column
      void client.list('sessions', {no_such_column: 'x'})
      // @ts-expect-error markers require created_at
      void client.create('markers', {session_id: 'conciv_x', kind: 'new', after_turn: 0, pending: 1})
    }
    void compileOnly
  })
})
