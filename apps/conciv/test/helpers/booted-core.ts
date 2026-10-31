import {afterAll, beforeAll} from 'vitest'
import type {BootCoreInput} from '../commands/core-control.js'
import {coreControl} from './core-control.js'

export function bootedCore(id: string, extra: Omit<BootCoreInput, 'id' | 'allowedOrigins'> = {}): () => string {
  const core = {base: ''}
  beforeAll(async () => {
    const booted = await coreControl.bootCore({...extra, id, allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)
  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)
  return () => core.base
}
