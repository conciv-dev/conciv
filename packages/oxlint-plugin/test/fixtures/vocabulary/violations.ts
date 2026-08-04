export function holdAndFlushQueue(): void {}
export type SnapshotKey = {value: string}
export const runEpoch = 1
export function adoptSession(sessionManager: string): string {
  return sessionManager
}
export const sendWhenAvailable = (): void => {}
export function forceSendNow(): void {}
export const externalRevCounter = 0
export type PaneWire = {presenceFlag: boolean; attach: () => void}
export const vetoResult = 'no'
export const bridgeToServer = (): void => {}
export const pipelineStage = 1
export const maintenanceWindow = 2
