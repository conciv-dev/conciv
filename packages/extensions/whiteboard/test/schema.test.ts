import {describe, expect, it} from 'vitest'
import {app} from '../src/shared/schema.js'
import permissions from '../src/shared/permissions.js'

const tableNames = ['canvasElements', 'comments', 'pins', 'cursors'] as const

describe('whiteboard app schema', () => {
  it('exposes the four scoped tables as query builders', () => {
    tableNames.forEach((name) => {
      expect(typeof app[name].where).toBe('function')
    })
  })

  it('builds a room-scoped query for every table', () => {
    tableNames.forEach((name) => {
      const query = app[name].where({room: 'local:local'})
      expect(query._table).toBe(name)
      expect(typeof query._build).toBe('function')
    })
  })

  it('compiles permissions for the app', () => {
    expect(permissions).toBeDefined()
  })
})
