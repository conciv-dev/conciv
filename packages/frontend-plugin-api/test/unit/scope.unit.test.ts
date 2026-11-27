import {initLogger} from 'evlog'
import {describe, expect, it} from 'vitest'
import {Scope} from '../../src/scope.js'

describe('reactive helpers and scope', () => {
  it('closing a scope aborts its signal, runs its finalizers last first past a failing one, and runs a late finalizer at once', async () => {
    const closed: string[] = []
    const logged: unknown[] = []
    initLogger({silent: true, pretty: false, drain: ({event}) => void logged.push(event)})
    const scope = Scope.make('notes', {timeout: 1_000})
    scope.addFinalizer(() => void closed.push('first'))
    scope.fork('session').addFinalizer(() => void closed.push('session'))
    scope.addFinalizer(() => {
      throw new Error('teardown failed')
    })
    const early = scope.addFinalizer(() => void closed.push('early'))
    scope.addFinalizer(() => void closed.push('last'))

    await early()
    expect(closed).toEqual(['early'])
    expect(scope.signal.aborted).toBe(false)

    await scope.close()
    expect(scope.signal.aborted).toBe(true)
    expect(closed).toEqual(['early', 'last', 'session', 'first'])
    expect(logged).toEqual([
      expect.objectContaining({
        level: 'error',
        action: 'scope',
        message: 'scope finalizer failed',
        scope: 'notes',
        error: expect.objectContaining({message: 'teardown failed'}),
      }),
    ])

    scope.addFinalizer(() => void closed.push('late'))
    await scope.close()
    expect(closed).toEqual(['early', 'last', 'session', 'first', 'late'])
  })
})
