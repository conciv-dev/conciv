import {getHostApi} from '@conciv/extension'
import {connectPorts} from '@conciv/protocol/connect-ports'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import {Check, Copy} from 'lucide-solid'
import {createSignal, onCleanup, onMount, Show, type JSX} from 'solid-js'
import {probeCore} from '../shared/probe.js'
import {stepStates, type StepState, type TryStep} from '../shared/try-steps.js'

const SLOW_HINT_MS = 60_000
const CONNECTED_HOLD_MS = 600
const PROBE_INTERVAL_MS = 2_000
const COPY_FEEDBACK_MS = 1_400

const STEP_TITLES: Record<TryStep, string> = {
  copy: 'Copy the agent prompt',
  run: 'Run it in your terminal',
  approve: "Approve Chrome's local-network prompt",
}

function CopyRow(props: {label: string; text: string; onCopy: () => void}): JSX.Element {
  const [done, setDone] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  const copy = () => {
    void navigator.clipboard.writeText(props.text)
    props.onCopy()
    setDone(true)
    clearTimeout(timer)
    timer = setTimeout(() => setDone(false), COPY_FEEDBACK_MS)
  }
  onCleanup(() => clearTimeout(timer))
  return (
    <div class="flex items-center gap-2 rounded-pw-md border border-pw-line bg-pw-fill py-1.5 pl-3 pr-1.5">
      <span class="min-w-0 flex-1 truncate font-mono text-[12px] text-pw-text-2" title={props.text}>
        {props.text}
      </span>
      <TooltipIconButton tooltip={props.label} class="size-7" onClick={copy}>
        <Show when={done()} fallback={<Copy class="size-3.5" aria-hidden="true" />}>
          <Check class="size-3.5 text-pw-accent" aria-hidden="true" />
        </Show>
      </TooltipIconButton>
    </div>
  )
}

function StepMarker(props: {index: number; state: StepState}): JSX.Element {
  return (
    <Show
      when={props.state === 'done'}
      fallback={
        <span
          data-state={props.state}
          class="grid size-5 shrink-0 place-items-center rounded-pw-pill border border-pw-line text-[11px] text-pw-text-3 trans-cbb data-[state=active]:border-pw-accent data-[state=active]:text-pw-accent"
        >
          {props.index}
        </span>
      }
    >
      <span class="anim-pop grid size-5 shrink-0 place-items-center rounded-pw-pill bg-pw-accent text-pw-on-accent">
        <Check class="size-3" aria-hidden="true" />
      </span>
    </Show>
  )
}

function Step(props: {index: number; state: StepState; title: string; children?: JSX.Element}): JSX.Element {
  return (
    <li data-state={props.state} class="group flex gap-3">
      <StepMarker index={props.index} state={props.state} />
      <div class="flex min-w-0 flex-1 flex-col gap-2 pt-px">
        <p class="text-[13px] font-semibold text-pw-text trans-color-bg group-data-[state=pending]:text-pw-text-3">
          {props.title}
        </p>
        {props.children}
      </div>
    </li>
  )
}

export function ConnectPane(props: {token: string}): JSX.Element {
  const connect = getHostApi().useConnect()
  const [copied, setCopied] = createSignal(false)
  const [connected, setConnected] = createSignal(false)
  const [slow, setSlow] = createSignal(false)
  const states = () => stepStates({copied: copied(), connected: connected()})
  const promptText = () => `Read ${connect.origin}/pair/${props.token} and follow the instructions`
  const npxText = () => `npx @conciv/try --token ${props.token}`
  const markCopied = () => setCopied(true)

  onMount(() => {
    const slowTimer = setTimeout(() => setSlow(true), SLOW_HINT_MS)
    const controller = new AbortController()
    let settled = false
    let handoff: ReturnType<typeof setTimeout> | undefined
    const probe = async () => {
      if (settled) return
      const base = await probeCore(props.token, connectPorts(), controller.signal)
      if (settled || !base) return
      settled = true
      clearInterval(interval)
      setConnected(true)
      handoff = setTimeout(() => connect.found(base), CONNECTED_HOLD_MS)
    }
    const interval = setInterval(() => void probe(), PROBE_INTERVAL_MS)
    void probe()
    onCleanup(() => {
      settled = true
      clearTimeout(slowTimer)
      clearTimeout(handoff)
      clearInterval(interval)
      controller.abort()
    })
  })

  return (
    <div class="flex h-full flex-col gap-3.5 p-5">
      <div class="anim-rise flex shrink-0 flex-col gap-1.5">
        <h2 class="text-[15px] font-semibold text-pw-text-hi">Drive this page with your agent.</h2>
        <p class="text-[13px] leading-relaxed text-pw-text-2">
          Your coding agent connects from <span class="font-medium text-pw-text">your</span> machine and takes the wheel
          — nothing to sign up for.
        </p>
      </div>

      <ol class="anim-rise-d m-0 flex min-h-0 flex-1 list-none flex-col gap-3.5 overflow-y-auto p-0">
        <Step index={1} state={states().copy} title={STEP_TITLES.copy}>
          <CopyRow label="Copy agent prompt" text={promptText()} onCopy={markCopied} />
          <details>
            <summary class="w-fit cursor-pointer text-[12px] text-pw-text-3 trans-color-bg hover:text-pw-text-2">
              or run it yourself
            </summary>
            <div class="mt-2">
              <CopyRow label="Copy connect command" text={npxText()} onCopy={markCopied} />
            </div>
          </details>
        </Step>
        <Step index={2} state={states().run} title={STEP_TITLES.run}>
          <p class="text-[12px] text-pw-text-3">First run installs the package (~30s).</p>
        </Step>
        <Step index={3} state={states().approve} title={STEP_TITLES.approve}>
          <p class="text-[12px] leading-relaxed text-pw-text-3">
            Chrome asks to allow local network access — that's your agent connecting. Approve it.
          </p>
        </Step>
      </ol>

      <div class="flex shrink-0 flex-col gap-2 border-t border-pw-line-soft pt-3">
        <Show
          when={connected()}
          fallback={
            <p class="flex items-center gap-2 text-[12.5px] text-pw-text-2">
              <span class="anim-pulse size-1.5 rounded-pw-pill bg-pw-accent" aria-hidden="true" />
              Waiting for your agent…
            </p>
          }
        >
          <p role="status" class="anim-rise flex items-center gap-2 text-[13px] font-semibold text-pw-accent">
            <Check class="size-4" aria-hidden="true" />
            Agent connected
          </p>
        </Show>
        <Show when={slow() && !connected()}>
          <p class="text-[12px] text-pw-text-3">
            Taking a while? See the{' '}
            <a href="/docs" class="text-pw-accent-link underline underline-offset-2">
              quickstart
            </a>{' '}
            for setup help.
          </p>
        </Show>
        <p class="text-[11.5px] leading-relaxed text-pw-text-3">
          Everything stays on your machine — prompts, code, and page snapshots never touch our servers.
        </p>
      </div>
    </div>
  )
}
