import type {RunDriver} from '../../src/chat/run-drivers.js'
import type {ChatDeps} from '../../src/chat/runtime.js'

export function drivingRun(chat: ChatDeps, runId: string): RunDriver {
  const driver = chat.runDrivers.driverOf(runId)
  if (!driver) throw new Error(`no driver is driving run ${runId}`)
  return driver
}
