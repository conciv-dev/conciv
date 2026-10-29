import {createSignal, Show, splitProps, type JSX} from 'solid-js'
import {createTimer} from '@solid-primitives/timer'
import {makeEventListener} from '@solid-primitives/event-listener'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {Button} from '@conciv/ui-kit-system'
import {Permission, usePermission} from '../../tools/primitives/permission.js'
import {FOCUS} from '../classes.js'
import {TRACE_INDENT, TRACE_MICROLABEL} from './trace-row.js'

const FRAME =
  'flex flex-col gap-[7px] flex-1 min-w-0 rounded-[var(--chat-radius-sm)] px-2.75 py-2.25 [background:var(--chat-perm-bg)] [border:1px_solid_var(--chat-perm-line)]'
const HEADER = 'flex items-center gap-1.5 min-w-0'
const HEADER_LABEL = `${TRACE_MICROLABEL} text-chat-perm-label`
const WARN_GLYPH = 'select-none flex-none text-[11px] leading-none text-chat-perm-label'
const CHIP =
  'flex-none ms-auto px-1.5 py-0.5 rounded-[var(--chat-radius-chip)] text-[10.5px] leading-[1.4] [font-family:var(--chat-mono)] text-chat-perm-path [background:var(--chat-perm-chip-bg)] [border:1px_solid_var(--chat-perm-line)]'
const TARGET = 'min-w-0 break-all text-[12px] leading-[1.5] [font-family:var(--chat-mono)] text-chat-target'
const EXPLANATION = 'min-w-0 text-[12.5px] leading-[1.45] [font-family:var(--chat-font)] text-chat-text-2'
const ACTIONS = 'flex flex-wrap items-center gap-2'
const BUTTON_SHAPE = `inline-flex items-center gap-1.5 px-2.5 py-2 rounded-[var(--chat-radius-sm)] text-[12px] font-medium leading-none [font-family:var(--chat-font)] [transition:background-color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease)] motion-reduce:[transition:none] ${FOCUS}`
const BUTTON_BASE = `${BUTTON_SHAPE} cursor-pointer`
const APPROVE = `${BUTTON_BASE} [background:var(--chat-perm-chip-bg)] [border:1px_solid_var(--chat-perm-line)] text-chat-perm-label hover:[background:var(--chat-perm-bg)] hover:[border-color:var(--chat-warn)]`
const DENY = `${BUTTON_BASE} [background:transparent] [border:1px_solid_transparent] text-chat-text-2 hover:[background:var(--chat-fill)] hover:[border-color:var(--chat-line)]`
const SESSION = `${BUTTON_BASE} [background:transparent] [border:1px_solid_var(--chat-line)] text-chat-text-2 hover:[background:var(--chat-fill)] hover:[border-color:var(--chat-perm-line)]`
const HINT = 'select-none text-[9px] leading-none [font-family:var(--chat-mono)] opacity-70'
const REQUEST_ITEM = 'pb-[3px] list-none min-w-0 relative'
const ANNOUNCE_ITEM = 'list-none'

const SECOND = 1000

function remainingLabel(expiresAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((expiresAt - now) / SECOND))
  const minutes = Math.floor(seconds / 60)
  const rest = `${seconds % 60}`.padStart(2, '0')
  return `expires in ${minutes}:${rest}`
}

function ExpiryChip(props: {expiresAt: number}): JSX.Element {
  const [now, setNow] = createSignal(Date.now())
  const expired = () => now() >= props.expiresAt
  createTimer(
    () => setNow(Date.now()),
    () => (expired() ? false : SECOND),
    setInterval,
  )
  return (
    <span role="timer" aria-live="off" class={CHIP}>
      {remainingLabel(props.expiresAt, now())}
    </span>
  )
}

const DECISION_MESSAGE = {approved: 'Approved the request', denied: 'Denied the request'} as const

const DECISION_CHIP = {approved: 'Approved', denied: 'Denied'} as const

const DECIDED = `${BUTTON_SHAPE} [background:transparent] [border:1px_solid_transparent] text-chat-text-2`

function Block(props: {target: string; explanation?: string; expiresAt?: number}): JSX.Element {
  const [local] = splitProps(props, ['target', 'explanation', 'expiresAt'])
  const permission = usePermission()
  const decision = () => permission.decision()
  const bindKeys = (element: HTMLDivElement) => {
    makeEventListener(element, 'keydown', (event) => {
      if (!permission.pending()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        permission.reject()
        return
      }
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      permission.approve()
    })
  }
  return (
    <>
      <Show when={permission.pending() || decision() !== undefined}>
        <li class={REQUEST_ITEM}>
          <div class={`flex min-w-0 items-start ${TRACE_INDENT}`}>
            <div
              ref={bindKeys}
              role="group"
              aria-label="Permission request"
              tabindex={permission.pending() ? '0' : undefined}
              class={`${FRAME}  ${FOCUS}`}
            >
              <div class={HEADER}>
                <span class={WARN_GLYPH} aria-hidden="true">
                  ⚠
                </span>
                <span class={HEADER_LABEL}>Permission</span>
                <Show when={permission.pending() && local.expiresAt}>
                  {(expiresAt) => <ExpiryChip expiresAt={expiresAt()} />}
                </Show>
              </div>
              <p class={TARGET}>{local.target}</p>
              <Show when={local.explanation}>{(explanation) => <p class={EXPLANATION}>{explanation()}</p>}</Show>
              <div class={ACTIONS}>
                <Show
                  when={permission.pending()}
                  fallback={
                    <Show when={decision()}>
                      {(settled) => <span class={DECIDED}>{DECISION_CHIP[settled()]}</span>}
                    </Show>
                  }
                >
                  <Button variant="plain" size="none" class={APPROVE} onClick={permission.approve}>
                    Approve
                    <span class={HINT} aria-hidden="true">
                      ⌘⏎
                    </span>
                  </Button>
                  <Show when={permission.rememberable()}>
                    <Button
                      variant="plain"
                      size="none"
                      class={SESSION}
                      title="Allows this exact command for the rest of the session"
                      onClick={permission.approveForSession}
                    >
                      Allow for session
                    </Button>
                  </Show>
                  <Button variant="plain" size="none" class={DENY} onClick={permission.reject}>
                    Deny
                    <span class={HINT} aria-hidden="true">
                      esc
                    </span>
                  </Button>
                </Show>
              </div>
            </div>
          </div>
        </li>
      </Show>
      <li class={ANNOUNCE_ITEM}>
        <p role="status" aria-live="polite" class="sr-only">
          <Show when={decision()}>{(settled) => DECISION_MESSAGE[settled()]}</Show>
        </p>
      </li>
    </>
  )
}

export function TracePermissionBlock(props: {
  part: ToolCallPart
  ctx: ToolViewCtx
  target: string
  explanation?: string
  expiresAt?: number
}): JSX.Element {
  const [local] = splitProps(props, ['part', 'ctx', 'target', 'explanation', 'expiresAt'])
  return (
    <Permission.Root part={local.part} ctx={local.ctx}>
      <Block target={local.target} explanation={local.explanation} expiresAt={local.expiresAt} />
    </Permission.Root>
  )
}
