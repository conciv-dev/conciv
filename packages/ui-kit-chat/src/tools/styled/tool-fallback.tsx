import {createSignal, Show, type JSX} from 'solid-js'
import {ChevronDown} from 'lucide-solid'
import {SolidCodeBlock, type FileOptions} from '@conciv/solid-diffs'
import {Collapsible} from '@conciv/ui-kit-system'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {ToolFallback as ToolFallbackPrimitive, useToolFallback} from '../primitives/tool-fallback.js'
import {Permission, usePermission} from '../primitives/permission.js'
import {StatusVisual} from '../primitives/status-visual.js'
import {formatDuration} from '../primitives/tool-util.js'
import {SHIMMER} from '../../styled/shimmer.js'
import {FOCUS} from '../../styled/classes.js'
import {ActionRow, ActionButton} from './action-row.js'

const CODE_OPTIONS: FileOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  disableFileHeader: true,
  disableLineNumbers: true,
  overflow: 'wrap',
}
const CODE_CLASS =
  'block max-h-80 overflow-auto rounded-[var(--chat-radius-sm)] text-[length:var(--chat-text-xs)] [background:var(--chat-sunken)]'

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
      class={`group text-[color:var(--chat-text-2)] hover:text-[color:var(--chat-text)] text-[length:var(--chat-text-md)] py-1.5 flex gap-2 w-fit cursor-pointer [transition:color_120ms_var(--chat-ease)] items-center ${FOCUS}`}
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
          <span class="text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] tabular-nums">
            {formatDuration(ms())}
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
      {(text) => (
        <SolidCodeBlock
          class={CODE_CLASS}
          options={CODE_OPTIONS}
          file={{name: 'args.txt', lang: 'text', contents: text()}}
        />
      )}
    </Show>
  )
}

function Result(): JSX.Element {
  const tool = useToolFallback()
  return (
    <Show when={tool.resultText()}>
      <div>
        <p class="text-[color:var(--chat-text-3)] text-[length:var(--chat-text-xs)] font-medium m-0">Result:</p>
        <SolidCodeBlock
          class={`mt-1 ${CODE_CLASS}`}
          options={CODE_OPTIONS}
          file={{name: 'result.txt', lang: 'text', contents: tool.resultText()}}
        />
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
