import {For, createUniqueId, type JSX} from 'solid-js'
import {Button} from '@conciv/ui-kit-system'

const BLOCKER_FIX_HINT =
  'Allow this dev server in your blocker (for uBlock Origin: click its icon, then the power button), then reload.'

const MISSING_FEATURES = [
  'A live replay of the page you can scrub back through',
  'Sending what you did to the agent, console errors included',
  'The agent recording its own steps and checking the screenshots',
]

export function RecorderNotice(props: {text: string}): JSX.Element {
  return <div class="text-[0.8125rem] text-chat-text-2 font-chat">{props.text}</div>
}

function BlockedIllustration(): JSX.Element {
  return (
    <svg
      viewBox="0 0 160 120"
      width="160"
      height="120"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="shrink-0"
    >
      <rect
        x="23"
        y="25"
        width="100"
        height="70"
        rx="10"
        fill="var(--chat-fill)"
        stroke="var(--chat-line)"
        stroke-width="1.5"
      />
      <path d="M23 40h100" stroke="var(--chat-line)" stroke-width="1.5" />
      <circle cx="34" cy="32.5" r="2.5" fill="var(--chat-accent)" />
      <path d="M42 32.5h13" stroke="var(--chat-text-3)" stroke-width="1.5" />
      <rect
        x="33"
        y="50"
        width="73"
        height="35"
        rx="5"
        fill="var(--chat-sunken)"
        stroke="var(--chat-line)"
        stroke-width="1.5"
      />
      <path d="m62 61 12 7-12 7z" stroke="var(--chat-text-3)" stroke-width="1.5" />
      <path
        d="M116 56c8 5 15 6 21 7v15c0 12-8 20-21 24-13-4-21-12-21-24V63c6-1 13-2 21-7Z"
        fill="var(--chat-fill)"
        stroke="var(--chat-text-3)"
        stroke-width="1.5"
      />
      <path d="M112 72v14M120 72v14" stroke="var(--chat-text-3)" stroke-width="1.5" />
      <path
        d="M46 100c9 5 19 6 29 2 5-2 8-5 11-9"
        stroke="var(--chat-line)"
        stroke-width="1.5"
        stroke-dasharray="1 6"
      />
      <path d="m83 91 4 1-1 4" stroke="var(--chat-text-3)" stroke-width="1.5" />
    </svg>
  )
}

export function RecorderBlockedNotice(): JSX.Element {
  const headingId = createUniqueId()
  return (
    <div
      role="status"
      aria-labelledby={headingId}
      class="font-chat flex flex-1 flex-col min-h-0 items-center justify-center-safe overflow-y-auto"
    >
      <div class="px-2 py-4 text-center flex flex-col gap-4 max-w-[26rem] w-full items-center">
        <BlockedIllustration />
        <div class="flex flex-col gap-1.5">
          <h2 id={headingId} class="text-[0.9375rem] text-chat-text leading-snug font-semibold m-0 text-balance">
            Recording is paused by your content blocker
          </h2>
          <p class="text-[0.8125rem] text-chat-text-2 leading-relaxed m-0 text-pretty">
            A blocker such as uBlock Origin stopped the recorder from loading. The rest of conciv works as usual.
          </p>
        </div>
        <section class="p-3 text-start border border-chat-line rounded-chat-surface-md bg-chat-fill flex flex-col gap-2 w-full">
          <h3 class="text-[0.6875rem] text-chat-text-3 tracking-[0.08em] font-semibold m-0 uppercase">
            What you're missing
          </h3>
          <ul class="m-0 p-0 list-none flex flex-col gap-1.5">
            <For each={MISSING_FEATURES}>
              {(feature) => (
                <li class="text-[0.8125rem] text-chat-text-2 leading-snug flex gap-2">
                  <span class="flex shrink-0 h-[1lh] items-center" aria-hidden="true">
                    <span class="rounded-full bg-chat-accent size-1.5" />
                  </span>
                  <span>{feature}</span>
                </li>
              )}
            </For>
          </ul>
        </section>
        <p class="text-[0.75rem] text-chat-text-3 leading-relaxed m-0 text-pretty">{BLOCKER_FIX_HINT}</p>
        <Button onClick={() => location.reload()}>Reload page</Button>
      </div>
    </div>
  )
}

export function RecorderBlockedCardNotice(): JSX.Element {
  return (
    <div role="status" class="font-chat flex flex-col gap-1">
      <p class="text-[0.8125rem] text-chat-text-2 m-0">Replay is paused by your content blocker.</p>
      <p class="text-[0.75rem] text-chat-text-3 leading-relaxed m-0">{BLOCKER_FIX_HINT}</p>
    </div>
  )
}

export function RecorderErrorNotice(props: {retry: () => void; text?: string}): JSX.Element {
  return (
    <div class="flex flex-col gap-2 items-start">
      <RecorderNotice text={props.text ?? 'Could not load the recording.'} />
      <Button variant="outline" size="sm" onClick={() => props.retry()}>
        Retry
      </Button>
    </div>
  )
}
