import {onCleanup, type Accessor} from 'solid-js'
import {createStore, reconcile, unwrap} from 'solid-js/store'
import {createTimer} from '@solid-primitives/timer'
import {connectPorts} from '@conciv/protocol/connect-ports'
import {probeCore} from '../shared/probe.js'
import {
  hintedSlow,
  holdingBase,
  probePlanFor,
  probeTransition,
  reachedCore,
  SEARCHING,
  type ProbeEvent,
  type ProbeState,
} from './probe-machine.js'

const SLOW_HINT_MS = 60_000
const CONNECTED_HOLD_MS = 600
const PROBE_INTERVAL_MS = 2_000

export type CoreProbe = {
  connected: Accessor<boolean>
  slow: Accessor<boolean>
}

export function useCoreProbe(deps: {token: Accessor<string>; onFound: (base: string) => void}): CoreProbe {
  const [state, setState] = createStore<ProbeState>({...SEARCHING})
  const controller = new AbortController()
  onCleanup(() => controller.abort())

  const apply = (event: ProbeEvent): void => {
    const before = unwrap(state)
    const after = probeTransition(before, event)
    const plan = probePlanFor(before, after)
    if (after !== before) setState(reconcile(after))
    if (plan.handOff !== null) deps.onFound(plan.handOff)
  }

  const sweep = async (): Promise<void> => {
    const base = await probeCore(deps.token(), connectPorts(), controller.signal)
    apply(base === null ? {type: 'silent'} : {type: 'answered', base})
  }

  const probeMs = (): number | false => (reachedCore(state) ? false : PROBE_INTERVAL_MS)
  const hintMs = (): number | false => (reachedCore(state) || hintedSlow(state) ? false : SLOW_HINT_MS)
  const holdMs = (): number | false => (holdingBase(state) === null ? false : CONNECTED_HOLD_MS)

  createTimer(() => void sweep(), probeMs, setInterval)
  createTimer(() => apply({type: 'slow'}), hintMs, setTimeout)
  createTimer(() => apply({type: 'held'}), holdMs, setTimeout)
  void sweep()

  return {connected: () => reachedCore(state), slow: () => hintedSlow(state)}
}
