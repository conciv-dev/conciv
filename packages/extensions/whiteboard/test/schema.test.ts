import {describe, expect, it} from 'vitest'
import {app} from '../src/shared/schema.js'
import permissions from '../src/shared/permissions.js'

describe('whiteboard jazz schema', () => {
  it('defines the five scoped tables the binding and tools use', () => {
    expect(app.canvasElements).toBeDefined()
    expect(app.canvasPending).toBeDefined()
    expect(app.comments).toBeDefined()
    expect(app.pins).toBeDefined()
    expect(app.cursors).toBeDefined()
  })

  it('compiles permissions for the app', () => {
    expect(permissions).toBeDefined()
  })
})
