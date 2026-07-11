import {createRoot} from 'solid-js'
import {describe, expect, it} from 'vitest'
import {createResizable, type Grow} from '../src/lib/resize.js'

const press = (key: string): KeyboardEvent => new KeyboardEvent('keydown', {key, cancelable: true})

function withResizable<T>(
  opts: {grow: Grow; initial?: number; min?: number; storageKey: string},
  run: (r: ReturnType<typeof createResizable>) => T,
): T {
  return createRoot((dispose) => {
    const resizable = createResizable({
      initial: opts.initial ?? 200,
      min: opts.min ?? 100,
      storageKey: opts.storageKey,
      grow: () => opts.grow,
    })
    const result = run(resizable)
    dispose()
    return result
  })
}

describe('createResizable keyboard resizing', () => {
  const cases: {grow: Grow; growKey: string; shrinkKey: string}[] = [
    {grow: 'right', growKey: 'ArrowRight', shrinkKey: 'ArrowLeft'},
    {grow: 'left', growKey: 'ArrowLeft', shrinkKey: 'ArrowRight'},
    {grow: 'down', growKey: 'ArrowDown', shrinkKey: 'ArrowUp'},
    {grow: 'up', growKey: 'ArrowUp', shrinkKey: 'ArrowDown'},
  ]

  for (const {grow, growKey, shrinkKey} of cases) {
    it(`grow=${grow}: ${growKey} grows, ${shrinkKey} shrinks, both prevent default`, () => {
      withResizable({grow, storageKey: `test-resize-${grow}`}, (r) => {
        const growEvent = press(growKey)
        r.onKeyDown(growEvent)
        expect(r.size()).toBe(224)
        expect(growEvent.defaultPrevented).toBe(true)
        const shrinkEvent = press(shrinkKey)
        r.onKeyDown(shrinkEvent)
        expect(r.size()).toBe(200)
        expect(shrinkEvent.defaultPrevented).toBe(true)
      })
    })
  }

  it('ignores cross-axis and unrelated keys', () => {
    withResizable({grow: 'right', storageKey: 'test-resize-cross'}, (r) => {
      for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'a']) {
        const event = press(key)
        r.onKeyDown(event)
        expect(r.size()).toBe(200)
        expect(event.defaultPrevented).toBe(false)
      }
    })
  })

  it('clamps shrinking at min', () => {
    withResizable({grow: 'right', initial: 110, min: 100, storageKey: 'test-resize-clamp'}, (r) => {
      r.onKeyDown(press('ArrowLeft'))
      expect(r.size()).toBe(100)
      r.onKeyDown(press('ArrowLeft'))
      expect(r.size()).toBe(100)
    })
  })

  it('persists the keyboard-set size for the next instance', () => {
    const storageKey = `test-resize-persist-${Date.now()}`
    withResizable({grow: 'down', storageKey}, (r) => {
      r.onKeyDown(press('ArrowDown'))
      expect(r.size()).toBe(224)
    })
    withResizable({grow: 'down', storageKey}, (r) => {
      expect(r.size()).toBe(224)
    })
  })
})
