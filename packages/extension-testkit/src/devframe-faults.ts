import type {Kit} from '@conciv/harness-testkit'
import {getRpcHandler} from 'devframe/rpc'

type FaultKit = Pick<Kit, 'hubInstance'>
type Invoke = (...args: unknown[]) => unknown
type Wrap = (invoke: Invoke, args: unknown[], name: string) => unknown

export type CallFault = {repair: () => void}
export type CallHold = {release: () => void}
export type CallGate = {arrived: Promise<void>; release: () => void}
export type CallRecord = {name: string; input: unknown}
export type CallObserver = {calls: () => CallRecord[]; stop: () => void}
export type CallCursor = {count: () => number}

async function wrapCalls(kit: FaultKit, names: readonly string[], wrap: Wrap): Promise<() => void> {
  const context = await kit.hubInstance.context
  const {rpc} = context
  const restores = await Promise.all(
    names.map(async (name) => {
      const definition = rpc.get(name)
      if (!definition) throw new Error(`no hub function named ${name} to wrap`)
      const invoke: Invoke = await getRpcHandler(definition, context)
      rpc.update({...definition, setup: undefined, handler: (...args: unknown[]) => wrap(invoke, args, name)})
      return () => rpc.update(definition)
    }),
  )
  return () => restores.forEach((restore) => restore())
}

export async function failCalls(kit: FaultKit, names: readonly string[], code = 'FAULT_INJECTED'): Promise<CallFault> {
  const repair = await wrapCalls(kit, names, () => {
    throw {concivError: true, code, message: `fault injected: ${code}`, data: null}
  })
  return {repair}
}

export function abortCalls(kit: FaultKit, names: readonly string[]): Promise<CallFault> {
  return failCalls(kit, names, 'DISCONNECTED')
}

export async function holdCalls(kit: FaultKit, names: readonly string[]): Promise<CallHold> {
  const held = Promise.withResolvers<void>()
  const restore = await wrapCalls(kit, names, async (invoke, args) => {
    await held.promise
    return invoke(...args)
  })
  return {
    release: () => {
      restore()
      held.resolve()
    },
  }
}

export async function gateCalls(kit: FaultKit, names: readonly string[]): Promise<CallGate> {
  const arrived = Promise.withResolvers<void>()
  const gate = Promise.withResolvers<void>()
  const restore = await wrapCalls(kit, names, async (invoke, args) => {
    arrived.resolve()
    await gate.promise
    return invoke(...args)
  })
  return {
    arrived: arrived.promise,
    release: () => {
      restore()
      gate.resolve()
    },
  }
}

export async function observeCalls(kit: FaultKit, pattern: RegExp): Promise<CallObserver> {
  const {rpc} = await kit.hubInstance.context
  const records: CallRecord[] = []
  const stop = await wrapCalls(
    kit,
    rpc.list().filter((name) => pattern.test(name)),
    (invoke, args, name) => {
      records.push({name, input: args[0]})
      return invoke(...args)
    },
  )
  return {calls: () => [...records], stop}
}

export function callCount(observer: CallObserver, name: string): number {
  return observer.calls().filter((call) => call.name === name).length
}

export function callCursor(observer: CallObserver, name: string): CallCursor {
  const start = callCount(observer, name)
  return {count: () => callCount(observer, name) - start}
}
