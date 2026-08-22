import type {ExtensionApi} from '@conciv/extension'
import {Collapsible, Tooltip, TooltipIconButton} from '@conciv/ui-kit-system'
import Check from 'lucide-solid/icons/check'
import Copy from 'lucide-solid/icons/copy'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import {createEffect, createSignal, onMount, Show, type JSX} from 'solid-js'
import {makeTimer} from '@solid-primitives/timer'
import {useCoreProbe} from './use-core-probe.js'
import {stepStates, type StepState, type TryStep} from '../shared/try-steps.js'
import {useLocalNetworkAccessPermission} from './use-lna-permission.js'

const COPY_FEEDBACK_MS = 1_400

export type ConnectCapability = ReturnType<ExtensionApi['useConnect']>

const STEP_TITLES: Record<TryStep, string> = {
  copy: 'Copy the connect command',
  run: 'Run it in your terminal',
  approve: "Approve Chrome's local-network prompt",
}

function CopyRow(props: {label: string; text: string; onCopy: () => void}): JSX.Element {
  const [doneAt, setDoneAt] = createSignal<number | null>(null)
  const done = () => doneAt() !== null
  const copy = () => {
    void navigator.clipboard.writeText(props.text)
    props.onCopy()
    setDoneAt(performance.now())
  }
  createEffect(() => {
    if (doneAt() === null) return
    makeTimer(() => setDoneAt(null), COPY_FEEDBACK_MS, setTimeout)
  })
  return (
    <div class="py-1.5 pl-3 pr-1.5 border border-chat-line rounded-chat-surface-md bg-chat-fill flex gap-2 items-center">
      <Tooltip.Root>
        <Tooltip.Trigger
          asChild={(triggerProps) => (
            <span {...triggerProps()} class="text-[12px] text-chat-text-2 font-mono text-start flex-1 min-w-0 truncate">
              {props.text}
            </span>
          )}
        />
        <Tooltip.Positioner>
          <Tooltip.Content class="font-mono [overflow-wrap:anywhere]">{props.text}</Tooltip.Content>
        </Tooltip.Positioner>
      </Tooltip.Root>
      <TooltipIconButton tooltip={props.label} class="size-7" onClick={copy}>
        <Show when={done()} fallback={<Copy class="size-3.5" aria-hidden="true" />}>
          <Check class="text-chat-accent size-3.5" aria-hidden="true" />
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
          class="text-[11px] text-chat-text-3 border border-chat-line rounded-chat-pill shrink-0 grid size-5 trans-cbb place-items-center data-[state=active]:text-chat-accent data-[state=active]:border-chat-accent"
        >
          {props.index}
        </span>
      }
    >
      <span class="text-chat-on-accent rounded-chat-pill bg-chat-accent shrink-0 grid size-5 place-items-center anim-pop">
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
        <p class="text-[13px] text-chat-text font-semibold trans-color-bg group-data-[state=pending]:text-chat-text-3">
          {props.title}
        </p>
        {props.children}
      </div>
    </li>
  )
}

export function ConnectPane(props: {token: string; connect: ConnectCapability}): JSX.Element {
  const [copied, setCopied] = createSignal(false)
  const probe = useCoreProbe({token: () => props.token, onFound: (base) => props.connect.found(base)})
  const connected = probe.connected
  const slow = probe.slow
  const localNetworkAccess = useLocalNetworkAccessPermission()
  const localNetworkBlocked = () => localNetworkAccess() === 'denied'
  const states = () => stepStates({copied: copied(), connected: connected()})
  const promptText = () =>
    `I'm pairing my browser tab at ${props.connect.origin} with a local conciv core so you can drive the page. ` +
    `Run \`npx @conciv/try --token ${props.token}\` and keep it running; it binds to 127.0.0.1 only and ` +
    `only my tab can reach it. The package source is packages/try in https://github.com/conciv-dev/conciv; ` +
    `inspect it first if you want (details: ${props.connect.origin}/pair/${props.token}). ` +
    `If you'd rather not run it, tell me and I'll run it in my own terminal.`
  const npxText = () => `npx @conciv/try --token ${props.token}`
  const markCopied = () => setCopied(true)

  let paneEl: HTMLDivElement | undefined
  onMount(() => {
    requestAnimationFrame(() => paneEl?.focus())
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
        <h2 class="text-[15px] text-chat-text-hi font-semibold">Drive this page with your agent.</h2>
        <p class="text-[13px] text-chat-text-2 leading-relaxed">
          Your coding agent connects from <span class="text-chat-text font-medium">your</span> machine and takes the
          wheel. Nothing to sign up for.
        </p>
      </div>

      <ol class="m-0 p-0 list-none flex flex-1 flex-col gap-3.5 min-h-0 overflow-y-auto anim-rise-d">
        <Step index={1} state={states().copy} title={STEP_TITLES.copy}>
          <CopyRow label="Copy connect command" text={npxText()} onCopy={markCopied} />
          <Collapsible.Root>
            <Collapsible.Trigger class="text-[12px] text-chat-text-3 w-fit cursor-pointer focus-ring trans-color-bg hover:text-chat-text-2">
              or hand it to your coding agent
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div class="mt-2 flex flex-col gap-1.5">
                <CopyRow label="Copy agent prompt" text={promptText()} onCopy={markCopied} />
                <p class="text-[11.5px] text-chat-text-3">
                  Some agents will ask you to run the command yourself, and that works too.
                </p>
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        </Step>
        <Step index={2} state={states().run} title={STEP_TITLES.run}>
          <p class="text-[12px] text-chat-text-3">First run installs the package (~30s).</p>
        </Step>
        <Step index={3} state={states().approve} title={STEP_TITLES.approve}>
          <Show
            when={localNetworkBlocked()}
            fallback={
              <p class="text-[12px] text-chat-text-3 leading-relaxed">
                Chrome asks to allow local network access. That's your agent connecting. Approve it.
              </p>
            }
          >
            <p role="alert" class="text-[12px] text-chat-danger leading-relaxed">
              Local network access was blocked. Click the site icon in the address bar, allow local network access, and
              reload.
            </p>
          </Show>
        </Step>
      </ol>

      <div class="pt-3 border-t border-chat-line-soft flex shrink-0 flex-col gap-2">
        <Show
          when={connected()}
          fallback={
            <Show
              when={localNetworkBlocked()}
              fallback={
                <p class="text-[12.5px] text-chat-text-2 flex gap-2 items-center">
                  <span class="rounded-chat-pill bg-chat-accent size-1.5 anim-pulse" aria-hidden="true" />
                  Waiting for your agent…
                </p>
              }
            >
              <p role="status" class="text-[12.5px] text-chat-danger flex gap-2 items-center">
                <TriangleAlert class="shrink-0 size-4" aria-hidden="true" />
                Local network access is blocked, so your agent can't reach this tab.
              </p>
            </Show>
          }
        >
          <p role="status" class="text-[13px] text-chat-accent font-semibold flex gap-2 items-center anim-rise">
            <Check class="size-4" aria-hidden="true" />
            Agent connected
          </p>
        </Show>
        <Show when={slow() && !connected() && !localNetworkBlocked()}>
          <p class="text-[12px] text-chat-text-3">
            Taking a while? See the{' '}
            <a href="/docs" class="text-chat-accent-link underline underline-offset-2">
              quickstart
            </a>{' '}
            for setup help.
          </p>
        </Show>
        <p class="text-[11.5px] text-chat-text-3 leading-relaxed">
          Everything stays on your machine: prompts, code, and page snapshots never touch our servers.
        </p>
      </div>
    </div>
  )
}
