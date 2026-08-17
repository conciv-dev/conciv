import {afterAll, beforeAll} from 'vitest'
import {coreControl} from './core-control.js'

export function bootedCore(id: string): () => string {
  const core = {base: ''}
  beforeAll(async () => {
    const booted = await coreControl.bootCore({id, allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)
  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)
  return () => core.base
}
