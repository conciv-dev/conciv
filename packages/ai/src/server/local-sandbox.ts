import {setTimeout as delay} from 'node:timers/promises'
import {RUN_CANCEL_REASON} from '@tanstack/ai'
import type {SandboxHandle, SandboxProvider, SpawnHandle} from '@tanstack/ai-sandbox'
import {localProcessSandbox} from '@tanstack/ai-sandbox-local-process'

const GROUP_EXIT_TIMEOUT_MS = 5_000

const GROUP_POLL_MS = 100

type Minted = {handle: SandboxHandle; signal: AbortSignal | undefined; spawned: SpawnHandle[]}

export function localSandbox(config: {dir: string}): SandboxProvider {
  const provider = localProcessSandbox(config)
  let minted: Minted[] = []
  const track = (handle: SandboxHandle, signal: AbortSignal | undefined): SandboxHandle => {
    const entry: Minted = {handle, signal, spawned: []}
    minted = [...minted.filter((earlier) => !finished(earlier)), entry]
    const tracked: SandboxHandle['process'] = {
      exec: (command, options) => handle.process.exec(command, options),
      spawn: async (command, options) => {
        const spawned = await handle.process.spawn(command, options)
        entry.spawned.push(spawned)
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
      await Promise.all(entry.spawned.map(killLeftovers))
    },
  }
}

function pickForDestroy(minted: Minted[], id: string): Minted | undefined {
  const forId = minted.filter((entry) => entry.handle.id === id)
  return forId.find((entry) => entry.signal?.reason === RUN_CANCEL_REASON) ?? forId[0]
}

function finished(entry: Minted): boolean {
  if (entry.signal?.reason === RUN_CANCEL_REASON || entry.spawned.length === 0) return false
  return entry.spawned.every((spawned) => !groupAlive(spawned.pid))
}

async function killLeftovers(spawned: SpawnHandle): Promise<void> {
  if (await groupExited(spawned.pid)) return
  await spawned.kill('SIGKILL')
  await groupExited(spawned.pid)
}

async function groupExited(group: number): Promise<boolean> {
  const deadline = Date.now() + GROUP_EXIT_TIMEOUT_MS
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
