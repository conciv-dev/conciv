import {afterEach} from 'vitest'
import type {FaultSpec} from '../commands/core-control.js'
import {coreControl} from './core-control.js'

export type TrackedFaults = {
  install: (spec: FaultSpec) => Promise<string>
  releaseAll: () => Promise<void>
}

export function trackedFaults(): TrackedFaults {
  const handles: string[] = []
  const install = async (spec: FaultSpec): Promise<string> => {
    const handle = await coreControl.installFault(spec)
    handles.push(handle)
    return handle
  }
  const releaseAll = async (): Promise<void> => {
    for (const handle of handles.splice(0)) await coreControl.releaseFault(handle)
  }
  afterEach(releaseAll)
  return {install, releaseAll}
}
