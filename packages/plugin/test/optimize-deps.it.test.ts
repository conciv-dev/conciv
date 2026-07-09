import {describe, expect, it} from 'vitest'
import {concivSolidConfig} from '../src/core/vite-plumbing.js'

describe('vite optimizeDeps for the extension graph', () => {
  it('excludes the extension runtime and force-includes nothing', () => {
    const {optimizeDeps} = concivSolidConfig()
    expect(optimizeDeps.exclude).toEqual(['@conciv/extension'])
    expect(optimizeDeps.include).toEqual([])
  })
})
