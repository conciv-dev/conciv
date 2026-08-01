import {describe, expect, it} from 'vitest'
import type {Grab} from '@conciv/grab'
import {resolveGrabSource} from '../src/chat/grab-source-resolve.js'

function unresolvedGrab(): Grab {
  return {
    text: '<Kx> in chunk-QWERTY.js',
    snippet: '<button id="try-cta">Try it live</button>',
    frames: [{fileName: 'https://example.test/chunk-QWERTY.js', line: 2, column: 11}],
    preview: {kind: 'image', dataUrl: 'data:image/png;base64,AA==', width: 10, height: 10},
    source: null,
    rect: null,
  }
}

describe('resolveGrabSource', () => {
  it('replaces the fallback text and source with the symbolicated location', async () => {
    const resolved = await resolveGrabSource(unresolvedGrab(), async () => ({
      file: 'src/components/landing/hero.tsx',
      line: 42,
      column: 5,
    }))
    expect(resolved?.text).toBe('<button id="try-cta">Try it live</button> at src/components/landing/hero.tsx:42:5')
    expect(resolved?.source).toEqual({
      componentName: null,
      filePath: 'src/components/landing/hero.tsx',
      lineNumber: 42,
    })
  })

  it('leaves the grab alone when symbolication finds nothing', async () => {
    expect(await resolveGrabSource(unresolvedGrab(), async () => null)).toBeNull()
  })

  it('leaves the grab alone when symbolication fails', async () => {
    const resolved = await resolveGrabSource(unresolvedGrab(), async () => {
      throw new Error('no widget')
    })
    expect(resolved).toBeNull()
  })

  it('does not call the server for a grab that already has a source', async () => {
    const calls: number[] = []
    const grab: Grab = {...unresolvedGrab(), source: {componentName: null, filePath: 'src/a.tsx', lineNumber: 1}}
    const resolved = await resolveGrabSource(grab, async () => {
      calls.push(1)
      return {file: 'src/b.tsx', line: 2, column: 0}
    })
    expect(resolved).toBeNull()
    expect(calls).toEqual([])
  })

  it('does not call the server for a grab with no frames', async () => {
    const calls: number[] = []
    const grab: Grab = {...unresolvedGrab(), frames: []}
    const resolved = await resolveGrabSource(grab, async () => {
      calls.push(1)
      return {file: 'src/b.tsx', line: 2, column: 0}
    })
    expect(resolved).toBeNull()
    expect(calls).toEqual([])
  })
})
