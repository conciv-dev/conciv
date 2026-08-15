import {commands} from 'vitest/browser'
import type {EngineStaleness} from '@conciv/contract'
import type {ScriptedTurn} from '@conciv/harness-testkit'
import type {BootCoreInput, BootCoreResult, FaultSpec} from '../commands/core-control.js'

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    bootCore: (input: BootCoreInput) => Promise<BootCoreResult>
    closeCore: () => Promise<void>
    setStaleness: (value: EngineStaleness) => Promise<void>
    holdTurn: () => Promise<void>
    releaseTurn: () => Promise<void>
    scriptError: (message: string) => Promise<void>
    scriptTurn: (turn: ScriptedTurn) => Promise<string[]>
    setTerminalLaunch: (succeeds: boolean) => Promise<void>
    terminalLaunches: () => Promise<number>
    rpcCallCount: (path: string[]) => Promise<number>
    rpcMark: () => Promise<number>
    awaitRpcCall: (path: string[], since: number) => Promise<number | null>
    installFault: (spec: FaultSpec) => Promise<string>
    releaseFault: (handle: string) => Promise<void>
    faultPending: (handle: string) => Promise<number>
    awaitFaultPending: (handle: string, count: number) => Promise<void>
  }
}

export const coreControl = commands
