import {describe, expect, it} from 'vitest'
import {whiteboardApp, whiteboardPermissions} from '../src/shared/schema.js'

const tableNames = ['canvasElements', 'comments', 'pins', 'cursors'] as const

describe('whiteboardApp', () => {
  it('exposes the four scoped tables as query builders', () => {
    tableNames.forEach((name) => {
      expect(typeof whiteboardApp[name].where).toBe('function')
    })
  })

  it('builds a room-scoped query for every table', () => {
    tableNames.forEach((name) => {
      const query = whiteboardApp[name].where({room: 'local:local'})
      expect(query._table).toBe(name)
      expect(typeof query._build).toBe('function')
    })
  })

  it('compiles permissions for the app', () => {
    expect(whiteboardPermissions).toBeDefined()
  })
})
