import {createSignal} from 'solid-js'

export type TerminalStore = {
  spawnModel: () => string | null
  setSpawnModel: (model: string | null) => void
  respawnTick: () => number
  bumpRespawn: () => void
  busy: () => boolean
  setBusy: (busy: boolean) => void
  respawning: () => boolean
  setRespawning: (respawning: boolean) => void
}

export function createTerminalStore(): TerminalStore {
  const [spawnModel, setSpawnModel] = createSignal<string | null>(null)
  const [respawnTick, setRespawnTick] = createSignal(0)
  const [busy, setBusy] = createSignal(false)
  const [respawning, setRespawning] = createSignal(false)
  return {
    spawnModel,
    setSpawnModel,
    respawnTick,
    bumpRespawn: () => setRespawnTick((n) => n + 1),
    busy,
    setBusy,
    respawning,
    setRespawning,
  }
}
