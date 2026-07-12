import {describe, expect, it} from 'vitest'
import {concivSolidConfig} from '../src/vite-plumbing.js'

describe('vite optimizeDeps for the extension graph', () => {
  it('excludes the Solid singletons and extension runtime, force-includes nothing', () => {
    const {optimizeDeps} = concivSolidConfig()
    expect(optimizeDeps.exclude).toEqual([
      'solid-js',
      'solid-js/web',
      'solid-js/store',
      '@tanstack/solid-router',
      '@ark-ui/solid',
      '@conciv/extension',
    ])
    expect(optimizeDeps.include).toEqual([])
  })
})
