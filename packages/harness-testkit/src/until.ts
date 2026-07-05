export type UntilOpts = {hangGuardMs?: number; settleFor?: number; failWhen?: () => boolean; intervalMs?: number}

export async function until(predicate: () => boolean | Promise<boolean>, opts: UntilOpts = {}): Promise<void> {
  const hangGuardMs = opts.hangGuardMs ?? 5000
  const intervalMs = opts.intervalMs ?? 10
  const settleFor = opts.settleFor ?? 0
  const deadline = performance.now() + hangGuardMs
  const heldSince = {at: null as number | null}
  while (true) {
    if (opts.failWhen?.()) throw new Error('until: failWhen tripped before the condition held')
    const ok = await predicate()
    if (ok) {
      if (settleFor === 0) return
      heldSince.at ??= performance.now()
      if (performance.now() - heldSince.at >= settleFor) return
    } else {
      heldSince.at = null
    }
    if (performance.now() > deadline) throw new Error(`until: stall - condition not met within ${hangGuardMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}
