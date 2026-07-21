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
  copy: 'Copy the connect command',
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
    <div class="py-1.5 pl-3 pr-1.5 border border-pw-line rounded-pw-md bg-pw-fill flex gap-2 items-center">
      <span class="text-[12px] text-pw-text-2 font-mono flex-1 min-w-0 truncate" title={props.text}>
        {props.text}
      </span>
      <TooltipIconButton tooltip={props.label} class="size-7" onClick={copy}>
        <Show when={done()} fallback={<Copy class="size-3.5" aria-hidden="true" />}>
          <Check class="text-pw-accent size-3.5" aria-hidden="true" />
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
          class="text-[11px] text-pw-text-3 border border-pw-line rounded-pw-pill shrink-0 grid size-5 trans-cbb place-items-center data-[state=active]:text-pw-accent data-[state=active]:border-pw-accent"
        >
          {props.index}
        </span>
      }
    >
      <span class="text-pw-on-accent rounded-pw-pill bg-pw-accent shrink-0 grid size-5 place-items-center anim-pop">
        <Check class="size-3" aria-hidden="true" />
      </span>
    </Show>
  )
}

function Step(props: {index: number; state: StepState; title: string; children?: JSX.Element}): JSX.Element {
  return (
    <li data-state={props.state} class="group flex gap-3">
      <StepMarker index={props.index} state={props.state} />
      <div class="pt-px flex flex-1 flex-col gap-2 min-w-0">
        <p class="text-[13px] text-pw-text font-semibold trans-color-bg group-data-[state=pending]:text-pw-text-3">
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
  const promptText = () =>
    `I'm pairing my browser tab at ${connect.origin} with a local conciv core so you can drive the page. ` +
    `Run \`npx @conciv/try --token ${props.token}\` and keep it running; it binds to 127.0.0.1 only and ` +
    `only my tab can reach it. The package source is packages/try in https://github.com/conciv-dev/conciv; ` +
    `inspect it first if you want (details: ${connect.origin}/pair/${props.token}). ` +
    `If you'd rather not run it, tell me and I'll run it in my own terminal.`
  const npxText = () => `npx @conciv/try --token ${props.token}`
  const markCopied = () => setCopied(true)

  let paneEl: HTMLDivElement | undefined
  onMount(() => {
    requestAnimationFrame(() => paneEl?.focus())
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
    <div
      ref={(el) => {
        paneEl = el
      }}
      tabindex={-1}
      class="p-5 outline-none flex flex-col gap-3.5 h-full"
    >
      <div class="flex shrink-0 flex-col gap-1.5 anim-rise">
        <h2 class="text-[15px] text-pw-text-hi font-semibold">Drive this page with your agent.</h2>
        <p class="text-[13px] text-pw-text-2 leading-relaxed">
          Your coding agent connects from <span class="text-pw-text font-medium">your</span> machine and takes the
          wheel. Nothing to sign up for.
        </p>
      </div>

      <ol class="m-0 p-0 list-none flex flex-1 flex-col gap-3.5 min-h-0 overflow-y-auto anim-rise-d">
        <Step index={1} state={states().copy} title={STEP_TITLES.copy}>
          <CopyRow label="Copy connect command" text={npxText()} onCopy={markCopied} />
          <details>
            <summary class="text-[12px] text-pw-text-3 w-fit cursor-pointer trans-color-bg hover:text-pw-text-2">
              or hand it to your coding agent
            </summary>
            <div class="mt-2 flex flex-col gap-1.5">
              <CopyRow label="Copy agent prompt" text={promptText()} onCopy={markCopied} />
              <p class="text-[11.5px] text-pw-text-3">
                Some agents will ask you to run the command yourself, and that works too.
              </p>
            </div>
          </details>
        </Step>
        <Step index={2} state={states().run} title={STEP_TITLES.run}>
          <p class="text-[12px] text-pw-text-3">First run installs the package (~30s).</p>
        </Step>
        <Step index={3} state={states().approve} title={STEP_TITLES.approve}>
          <p class="text-[12px] text-pw-text-3 leading-relaxed">
            Chrome asks to allow local network access. That's your agent connecting. Approve it.
          </p>
        </Step>
      </ol>

      <div class="pt-3 border-t border-pw-line-soft flex shrink-0 flex-col gap-2">
        <Show
          when={connected()}
          fallback={
            <p class="text-[12.5px] text-pw-text-2 flex gap-2 items-center">
              <span class="rounded-pw-pill bg-pw-accent size-1.5 anim-pulse" aria-hidden="true" />
              Waiting for your agent…
            </p>
          }
        >
          <p role="status" class="text-[13px] text-pw-accent font-semibold flex gap-2 items-center anim-rise">
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
        <p class="text-[11.5px] text-pw-text-3 leading-relaxed">
          Everything stays on your machine: prompts, code, and page snapshots never touch our servers.
        </p>
      </div>
    </div>
  )
}
