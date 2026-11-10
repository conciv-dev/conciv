import {setTimeout as delay} from 'node:timers/promises'
import {RUN_CANCEL_REASON} from '@tanstack/ai'
import type {SandboxHandle, SandboxProvider, SpawnHandle} from '@tanstack/ai-sandbox'
import {localProcessSandbox} from '@tanstack/ai-sandbox-local-process'

const GROUP_EXIT_TIMEOUT_MS = 5_000

const GROUP_POLL_MS = 100

type Minted = {handle: SandboxHandle; signal: AbortSignal | undefined; spawned: SpawnHandle[]}

export function localSandbox(config: {dir: string}): SandboxProvider {
  const provider = localProcessSandbox(config)
  const minted: Minted[] = []
  const track = (handle: SandboxHandle, signal: AbortSignal | undefined): SandboxHandle => {
    const entry: Minted = {handle, signal, spawned: []}
    minted.push(entry)
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
      const entry = takeForDestroy(minted, input.id)
      if (entry === undefined) return provider.destroy(input)
      await entry.handle.destroy()
      await Promise.all(entry.spawned.map(killLeftovers))
    },
  }
}

function takeForDestroy(minted: Minted[], id: string): Minted | undefined {
  const forId = minted.filter((entry) => entry.handle.id === id)
  const chosen = forId.find((entry) => entry.signal?.reason === RUN_CANCEL_REASON) ?? forId[0]
  if (chosen !== undefined) minted.splice(minted.indexOf(chosen), 1)
  return chosen
}

async function killLeftovers(spawned: SpawnHandle): Promise<void> {
  if (await groupExited(spawned.pid)) return
  await spawned.kill('SIGKILL')
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
