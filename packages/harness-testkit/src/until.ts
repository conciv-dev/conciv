export type UntilOpts = {hangGuardMs?: number; settleFor?: number; failWhen?: () => boolean; intervalMs?: number}

function makeSettleGate(settleFor: number): (ok: boolean) => boolean {
  const state = {since: null as number | null}
  return (ok) => {
    if (!ok) {
      state.since = null
      return false
    }
    if (settleFor === 0) return true
    state.since ??= performance.now()
    return performance.now() - state.since >= settleFor
  }
}

export async function until(predicate: () => boolean | Promise<boolean>, opts: UntilOpts = {}): Promise<void> {
  const hangGuardMs = opts.hangGuardMs ?? 5000
  const intervalMs = opts.intervalMs ?? 10
  const settled = makeSettleGate(opts.settleFor ?? 0)
  const deadline = performance.now() + hangGuardMs
  while (true) {
    if (opts.failWhen?.()) throw new Error('until: failWhen tripped before the condition held')
    if (settled(await predicate())) return
    if (performance.now() > deadline) throw new Error(`until: stall - condition not met within ${hangGuardMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
