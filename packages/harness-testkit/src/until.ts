import pTimeout from 'p-timeout'

export type UntilOpts = {hangGuardMs?: number; settleFor?: number; failWhen?: () => boolean; intervalMs?: number}

const STALL_LABEL = 'until: stall - condition not met'

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

async function poll(
  predicate: () => boolean | Promise<boolean>,
  opts: UntilOpts,
  hangGuardMs: number,
  deadlineAt: number,
): Promise<void> {
  const intervalMs = opts.intervalMs ?? 10
  const settled = makeSettleGate(opts.settleFor ?? 0)
  while (true) {
    if (opts.failWhen?.()) throw new Error('until: failWhen tripped before the condition held')
    if (settled(await predicate())) return
    if (performance.now() > deadlineAt) throw new Error(`${STALL_LABEL} exceeded ${hangGuardMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

export function until(predicate: () => boolean | Promise<boolean>, opts: UntilOpts = {}): Promise<void> {
  const hangGuardMs = opts.hangGuardMs ?? 5000
  return pTimeout(poll(predicate, opts, hangGuardMs, performance.now() + hangGuardMs), {
    milliseconds: hangGuardMs,
    message: `${STALL_LABEL} exceeded ${hangGuardMs}ms`,
  })
}
