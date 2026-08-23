import {createSignal, Show, type JSX} from 'solid-js'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import {Collapsible} from '@conciv/ui-kit-system'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {ToolFallback as ToolFallbackPrimitive, useToolFallback} from '../primitives/tool-fallback.js'
import {Permission, usePermission} from '../primitives/permission.js'
import {StatusVisual} from '../primitives/status-visual.js'
import {formatDuration} from '../primitives/tool-util.js'
import {QUIET_TEXT_CLASS} from '../primitives/tool-presentation.js'
import {SHIMMER} from '../../styled/shimmer.js'
import {FOCUS} from '../../styled/classes.js'
import {TRACE_MICROLABEL} from '../../styled/trace/trace-row.js'
import {ActionRow, ActionButton} from './action-row.js'
import {ShapedText} from './shaped-content.js'
import {useEmbeddedCard} from './card-chrome.js'

function FallbackRoot(props: {children: JSX.Element}): JSX.Element {
  const tool = useToolFallback()
  const embedded = useEmbeddedCard()
  const [userOpen, setUserOpen] = createSignal<boolean>()
  const open = () => userOpen() ?? tool.status() === 'approval'
  return (
    <Show when={!embedded()} fallback={props.children}>
      <Collapsible.Root open={open()} onOpenChange={(details) => setUserOpen(details.open)} class="min-w-0 w-full">
        {props.children}
      </Collapsible.Root>
    </Show>
  )
}

function Trigger(): JSX.Element {
  const tool = useToolFallback()
  const embedded = useEmbeddedCard()
  const running = () => tool.status() === 'running'
  return (
    <Show when={!embedded()}>
      <Collapsible.Trigger
        class={`group text-[length:var(--chat-text-md)] text-chat-text-2 py-1.5 flex gap-2 w-fit cursor-pointer [transition:color_120ms_var(--chat-ease)] items-center hover:text-chat-text ${FOCUS}`}
      >
        <StatusVisual status={tool.status()} form="icon" />
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
            <span class="text-[length:var(--chat-text-xs)] text-chat-text-3 tabular-nums">{formatDuration(ms())}</span>
          )}
        </Show>
        <ChevronDown
          size={16}
          class="text-chat-text-3 shrink-0 [transition:rotate_150ms_var(--chat-ease)] group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90"
          aria-hidden="true"
        />
      </Collapsible.Trigger>
    </Show>
  )
}

const FALLBACK_BODY = 'text-[length:var(--chat-text-md)] flex flex-col gap-[7px] min-w-0'
const SECTION = 'min-w-0 flex flex-col gap-[6px]'
const SECTION_LABEL = `${TRACE_MICROLABEL} text-chat-microlabel m-0`
const RESULT_BODY =
  'min-w-0 rounded-e-[var(--chat-radius-sm)] ps-2 py-1 [border-inline-start:2px_solid_color-mix(in_oklab,var(--chat-success)_45%,transparent)] [background:color-mix(in_oklab,var(--chat-success)_4%,transparent)]'

function Content(props: {children: JSX.Element}): JSX.Element {
  const embedded = useEmbeddedCard()
  return (
    <Show when={!embedded()} fallback={<div class={FALLBACK_BODY}>{props.children}</div>}>
      <Collapsible.Content>
        <div class={`${FALLBACK_BODY} pb-2 pl-6 pt-1`}>{props.children}</div>
      </Collapsible.Content>
    </Show>
  )
}

function Args(): JSX.Element {
  const tool = useToolFallback()
  const hasInput = () => {
    const text = tool.argsText().trim()
    return text.length > 0 && text !== '{}'
  }
  return (
    <Show when={hasInput()} fallback={<p class={QUIET_TEXT_CLASS}>no input</p>}>
      <ShapedText name="args" text={tool.argsText()} />
    </Show>
  )
}

function Result(): JSX.Element {
  const tool = useToolFallback()
  return (
    <Show when={tool.resultText()}>
      <div class={SECTION}>
        <p class={SECTION_LABEL}>Result</p>
        <div class={RESULT_BODY}>
          <ShapedText name="result" text={tool.resultText()} />
        </div>
      </div>
    </Show>
  )
}

function ToolError(): JSX.Element {
  const tool = useToolFallback()
  return (
    <Show when={tool.error()}>
      {(message) => (
        <div class={SECTION}>
          <p class={`${SECTION_LABEL} text-chat-danger`}>Error</p>
          <p class="text-chat-text-2 m-0 [overflow-wrap:anywhere]">{message()}</p>
        </div>
      )}
    </Show>
  )
}

function ApprovalButtons(): JSX.Element {
  const permission = usePermission()
  return (
    <Show when={permission.pending()}>
      <div class="pt-1" role="group" aria-label="Approve this action?">
        <ActionRow>
          <ActionButton intent="allow" onClick={() => permission.approve()}>
            Allow
          </ActionButton>
          <ActionButton intent="deny" onClick={() => permission.reject()}>
            Deny
          </ActionButton>
        </ActionRow>
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
