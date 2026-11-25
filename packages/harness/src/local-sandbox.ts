import {setTimeout as delay} from 'node:timers/promises'
import {RUN_CANCEL_REASON} from '@tanstack/ai'
import type {SandboxHandle, SandboxProvider, SpawnHandle} from '@tanstack/ai-sandbox'
import {localProcessSandbox} from '@tanstack/ai-sandbox-local-process'

export const GROUP_EXIT_TIMEOUT_MS = 5_000

const GROUP_POLL_MS = 100

type Minted = {handle: SandboxHandle; signal: AbortSignal | undefined; spawned: SpawnHandle[]}

const groups = new Set<number>()
let hooked = false
const killGroups = () =>
  groups.forEach((pid) => {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      groups.delete(pid)
    }
  })

export function localSandbox({
  dir,
  groupExitTimeoutMs = GROUP_EXIT_TIMEOUT_MS,
}: {
  dir: string
  groupExitTimeoutMs?: number
}): SandboxProvider {
  const provider = localProcessSandbox({dir})
  let minted: Minted[] = []
  const track = (handle: SandboxHandle, signal: AbortSignal | undefined): SandboxHandle => {
    const entry: Minted = {handle, signal, spawned: []}
    minted = [...minted.filter((earlier) => !finished(earlier)), entry]
    const tracked: SandboxHandle['process'] = {
      exec: (command, options) => handle.process.exec(command, options),
      spawn: async (command, options) => {
        options?.signal?.throwIfAborted()
        const spawned = await handle.process.spawn(command, options)
        entry.spawned.push(spawned)
        killOnExit(spawned)
        return spawned
      },
    }
    return new Proxy(handle, {
      get: (target, key, receiver) => (key === 'process' ? tracked : Reflect.get(target, key, receiver)),
    })
  }
  return {
    name: provider.name,
    capabilities: () => provider.capabilities(),
    create: async (input) => track(await provider.create(input), input.signal),
    resume: async (input) => {
      const handle = await provider.resume(input)
      return handle === null ? null : track(handle, input.signal)
    },
    destroy: async (input) => {
      const entry = pickForDestroy(minted, input.id)
      if (entry === undefined) return provider.destroy(input)
      minted = minted.filter((other) => other !== entry)
      await entry.handle.destroy()
      await Promise.all(entry.spawned.map((spawned) => killLeftovers(spawned, groupExitTimeoutMs)))
    },
  }
}

function killOnExit(spawned: SpawnHandle): void {
  if (process.platform === 'win32' || spawned.pid <= 0) return
  if (!hooked) process.once('exit', killGroups)
  hooked = true
  groups.add(spawned.pid)
  const forget = () => groups.delete(spawned.pid)
  spawned.wait().then(forget, forget)
}

function pickForDestroy(minted: Minted[], id: string): Minted | undefined {
  const forId = minted.filter((entry) => entry.handle.id === id)
  return forId.find((entry) => entry.signal?.reason === RUN_CANCEL_REASON) ?? forId[0]
}

function finished(entry: Minted): boolean {
  if (entry.signal?.reason === RUN_CANCEL_REASON || entry.spawned.length === 0) return false
  return entry.spawned.every((spawned) => !groupAlive(spawned.pid))
}

export async function killLeftovers(
  spawned: {pid: number; kill: (signal: NodeJS.Signals) => unknown},
  groupExitTimeoutMs = GROUP_EXIT_TIMEOUT_MS,
): Promise<void> {
  if (await groupExited(spawned.pid, groupExitTimeoutMs)) return
  await spawned.kill('SIGKILL')
  await groupExited(spawned.pid, groupExitTimeoutMs)
}

async function groupExited(group: number, groupExitTimeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + groupExitTimeoutMs
  while (groupAlive(group)) {
    if (Date.now() >= deadline) return false
    await delay(GROUP_POLL_MS)
  }
  return true
}

function groupAlive(group: number): boolean {
  if (group <= 0) return false
  try {
    process.kill(-group, 0)
    return true
  } catch {
    return false
  }
}
