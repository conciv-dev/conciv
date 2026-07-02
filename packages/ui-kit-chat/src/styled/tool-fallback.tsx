import {createSignal, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {Check, ChevronDown, CircleAlert, CircleX, LoaderCircle, type LucideIcon} from 'lucide-solid'
import {Collapsible} from '@conciv/ui-kit-system'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {ToolFallback as ToolFallbackPrimitive, useToolFallback} from '../primitives/tools/tool-fallback.js'
import {Permission, usePermission} from '../primitives/tools/permission.js'
import type {ToolStatus} from '../primitives/tools/tool-status.js'
import {SHIMMER} from './shimmer.js'
import {FOCUS} from './classes.js'

const STATUS_ICON: Record<ToolStatus, LucideIcon> = {
  running: LoaderCircle,
  complete: Check,
  error: CircleX,
  approval: CircleAlert,
}

function formatToolDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  const seconds = ms / 1000
  if (seconds < 10) return `${(Math.floor(seconds * 10) / 10).toFixed(1)}s`
  if (seconds < 60) return `${Math.floor(seconds)}s`
  return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
}

const PRE =
  'm-0 max-h-80 overflow-auto rounded-[var(--chat-radius-sm)] p-2.5 text-[length:var(--chat-text-xs)] whitespace-pre-wrap [overflow-wrap:anywhere] [background:var(--chat-sunken)] [color:var(--chat-text)]'
const BTN =
  'inline-flex items-center gap-1 py-1 px-2.5 rounded-[var(--chat-radius-sm)] [border:1px_solid] font-semibold text-[length:var(--chat-text-sm)] leading-none cursor-pointer'
const ALLOW = `${BTN} text-[color:var(--chat-on-accent)] [border-color:var(--chat-accent)] [background:var(--chat-accent)] hover:[background:var(--chat-accent-hi)]`
const DENY = `${BTN} text-[color:var(--chat-text-2)] [border-color:var(--chat-line)] [background:var(--chat-fill)] hover:[color:var(--chat-danger)] hover:[background:var(--chat-fill-strong)]`

function FallbackRoot(props: {children: JSX.Element}): JSX.Element {
  const tool = useToolFallback()
  const [userOpen, setUserOpen] = createSignal<boolean>()
  const open = () => userOpen() ?? tool.status() === 'approval'
  return (
    <Collapsible.Root open={open()} onOpenChange={(details) => setUserOpen(details.open)} class="min-w-0 w-full">
      {props.children}
    </Collapsible.Root>
  )
}

function Trigger(): JSX.Element {
  const tool = useToolFallback()
  const running = () => tool.status() === 'running'
  return (
    <Collapsible.Trigger
      class={`group text-[color:var(--chat-text-2)] hover:text-[color:var(--chat-text)] text-[length:var(--chat-text-md)] py-1.5 flex gap-2 w-fit cursor-pointer [transition:color_120ms] items-center ${FOCUS}`}
    >
      <Dynamic
        component={STATUS_ICON[tool.status()]}
        size={16}
        class={`shrink-0 ${running() ? 'anim-tool-spin motion-reduce:[animation:none]' : ''}`}
        aria-hidden="true"
      />
      <span class="leading-none text-start inline-block relative">
        <span>
          Used tool: <b class="[color:var(--chat-text)]">{tool.name()}</b>
        </span>
        <Show when={running()}>
          <span aria-hidden="true" class={`pointer-events-none inset-0 absolute ${SHIMMER}`}>
            Used tool: <b>{tool.name()}</b>
          </span>
        </Show>
      </span>
      <Show when={tool.durationMs()}>
        {(ms) => (
          <span class="text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] tabular-nums">
            {formatToolDuration(ms())}
          </span>
        )}
      </Show>
      <ChevronDown
        size={16}
        class="text-[color:var(--chat-text-3)] shrink-0 [transition:rotate_150ms_var(--chat-ease)] group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90"
        aria-hidden="true"
      />
    </Collapsible.Trigger>
  )
}

function Content(props: {children: JSX.Element}): JSX.Element {
  return (
    <Collapsible.Content>
      <div class="text-[length:var(--chat-text-md)] pb-2 pl-6 pt-1 flex flex-col gap-2">{props.children}</div>
    </Collapsible.Content>
  )
}

function Args(): JSX.Element {
  const tool = useToolFallback()
  return (
    <Show when={tool.argsText()}>
      <pre class={PRE}>{tool.argsText()}</pre>
    </Show>
  )
}

function Result(): JSX.Element {
  const tool = useToolFallback()
  return (
    <Show when={tool.resultText()}>
      <div>
        <p class="text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] font-medium m-0">Result:</p>
        <pre class={`mt-1 ${PRE}`}>{tool.resultText()}</pre>
      </div>
    </Show>
  )
}

function ToolError(): JSX.Element {
  const tool = useToolFallback()
  return (
    <Show when={tool.error()}>
      {(message) => (
        <div>
          <p class="text-[color:var(--chat-text-3)] font-semibold m-0">Error:</p>
          <p class="text-[color:var(--chat-text-2)] m-0 [overflow-wrap:anywhere]">{message()}</p>
        </div>
      )}
    </Show>
  )
}

function ApprovalButtons(): JSX.Element {
  const permission = usePermission()
  return (
    <Show when={permission.pending()}>
      <div class="pt-1 flex flex-wrap gap-2 items-center" role="group" aria-label="Approve this action?">
        <button type="button" class={ALLOW} onClick={() => permission.approve()}>
          Allow
        </button>
        <button type="button" class={DENY} onClick={() => permission.reject()}>
          Deny
        </button>
      </div>
    </Show>
  )
}

function Approval(): JSX.Element {
  const tool = useToolFallback()
  return (
    <Permission.Root part={tool.part()} ctx={tool.ctx()}>
      <ApprovalButtons />
    </Permission.Root>
  )
}

function ToolFallbackImpl(props: ToolCardProps): JSX.Element {
  return (
    <ToolFallbackPrimitive.Root part={props.part} result={props.result} ctx={props.ctx} durationMs={props.durationMs}>
      <FallbackRoot>
        <Trigger />
        <Content>
          <ToolError />
          <Args />
          <Approval />
          <Result />
        </Content>
      </FallbackRoot>
    </ToolFallbackPrimitive.Root>
  )
}

export const ToolFallback = Object.assign(ToolFallbackImpl, {
  Root: FallbackRoot,
  Trigger,
  Content,
  Args,
  Result,
  Error: ToolError,
  Approval,
})
