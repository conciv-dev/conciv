import {
  createContext,
  createMemo,
  createSignal,
  Index,
  Match,
  Show,
  Switch,
  useContext,
  type JSX,
  type ParentProps,
} from 'solid-js'
import Check from 'lucide-solid/icons/check'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import Loader from 'lucide-solid/icons/loader'
import ShieldQuestion from 'lucide-solid/icons/shield-question-mark'
import X from 'lucide-solid/icons/x'
import type {MessagePart, ToolCallPart, UIMessage} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolCardView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {Collapsible} from '@conciv/ui-kit-system'
import {INERT_TOOL_CTX} from '../store/tool-context.js'
import {Activity as ActivityPrimitive, useActivity, type ActivityLabeler} from '../primitives/activity/activity.js'
import {
  CHAIN_GROUP_KEY,
  childCallsFor,
  groupEntryFor,
  groupParts,
  parentToolCallIdOf,
  type GroupEntry,
  type GroupNode,
  type GroupNodeGroup,
  type GroupNodePart,
  type Grouping,
  type Turn,
} from '../store/grouping.js'
import {createGrouping, type PageSessionConfig} from '../store/page-session.js'
import {Dynamic} from 'solid-js/web'
import {toolStatus, type ToolStatus} from '../tools/primitives/tool-status.js'
import {createAutoCollapse} from '../primitives/util/create-auto-collapse.js'
import {useThreadAutoScroll} from '../behaviors/use-thread-auto-scroll.js'
import {ToolCallCard} from '../tools/styled/tool-call-card.js'
import {Group} from './group.js'
import {toolFallbackCardView} from '../tools/styled/tool-fallback.js'
import {Markdown} from './markdown.js'
import {SHIMMER} from './shimmer.js'
import {FOCUS_INSET, SPIN} from './classes.js'

type ActivityConfig = {
  tools: () => ToolCardEntry[]
  fallback: () => ToolCardView
  ctx: () => ToolViewCtx
  pageSession: () => PageSessionConfig | undefined
  grouping: () => Grouping | undefined
  groupEntries: () => readonly GroupEntry[]
}

const ActivityConfigContext = createContext<ActivityConfig>({
  tools: () => [],
  fallback: () => toolFallbackCardView,
  ctx: () => ({...INERT_TOOL_CTX, respondApproval: () => {}}),
  pageSession: () => undefined,
  grouping: () => undefined,
  groupEntries: () => [],
})

export type ActivityProps = ParentProps<{
  messages: UIMessage[]
  live?: boolean
  label?: ActivityLabeler
  tools?: ToolCardEntry[]
  ctx?: ToolViewCtx
  fallback?: ToolCardView
  pageSession?: PageSessionConfig
  grouping?: Grouping
  groupEntries?: readonly GroupEntry[]
  class?: string
}>

function Root(props: ActivityProps): JSX.Element {
  const parent = useContext(ActivityConfigContext)
  return (
    <ActivityPrimitive.Root messages={props.messages} live={props.live} label={props.label}>
      <ActivityConfigContext.Provider
        value={{
          tools: () => props.tools ?? [],
          fallback: () => props.fallback ?? toolFallbackCardView,
          ctx: () => props.ctx ?? parent.ctx(),
          pageSession: () => props.pageSession ?? parent.pageSession(),
          grouping: () => props.grouping ?? parent.grouping(),
          groupEntries: () => props.groupEntries ?? parent.groupEntries(),
        }}
      >
        <div
          class={`flex flex-col min-h-0 min-w-0 [color:var(--chat-text)] [font-family:var(--chat-font)] ${props.class ?? ''}`}
        >
          {props.children}
        </div>
      </ActivityConfigContext.Provider>
    </ActivityPrimitive.Root>
  )
}

function stepGlyph(status: ToolStatus): JSX.Element {
  return (
    <Switch>
      <Match when={status === 'running'}>
        <Loader size={12} class={SPIN} aria-hidden="true" />
      </Match>
      <Match when={status === 'error'}>
        <X size={12} class="text-chat-danger shrink-0" aria-hidden="true" />
      </Match>
      <Match when={status === 'approval'}>
        <ShieldQuestion size={12} class="text-chat-accent shrink-0" aria-hidden="true" />
      </Match>
      <Match when={status === 'complete'}>
        <Check size={12} class="text-chat-success shrink-0" aria-hidden="true" />
      </Match>
    </Switch>
  )
}

const STEP_TRIGGER = `group flex w-full items-center gap-2 px-2 py-1 rounded-[var(--chat-radius-sm)] text-[length:var(--chat-text-sm)] [color:var(--chat-text-2)] cursor-pointer select-none hover:[background:var(--chat-fill-strong)] ${FOCUS_INSET}`
const STEP_CHEVRON =
  'size-3 shrink-0 ml-auto opacity-0 group-hover:opacity-100 [transition:rotate_150ms_var(--chat-ease)] group-data-[state=open]:opacity-100 group-data-[state=closed]:-rotate-90'

function asThinking(part: MessagePart | undefined): Extract<MessagePart, {type: 'thinking'}> | null {
  return part?.type === 'thinking' && part.content.trim().length > 0 ? part : null
}

function asToolCall(part: MessagePart | undefined): ToolCallPart | null {
  return part?.type === 'tool-call' ? part : null
}

function StepShell(
  props: ParentProps<{glyph: JSX.Element; title: string; titleClass?: string; autoOpen?: boolean}>,
): JSX.Element {
  const collapse = createAutoCollapse({streaming: () => props.autoOpen === true})
  return (
    <Collapsible.Root open={collapse.open()} onOpenChange={(details) => collapse.setOpen(details.open)}>
      <Collapsible.Trigger class={STEP_TRIGGER}>
        {props.glyph}
        <span class={`text-left flex-1 min-w-0 truncate ${props.titleClass ?? ''}`}>{props.title}</span>
        <ChevronDown size={12} class={STEP_CHEVRON} aria-hidden="true" />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div class="py-1 pl-6.5 pr-1 min-w-0">{props.children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

function ToolStep(props: {part: ToolCallPart; subCalls?: ToolCallPart[]}): JSX.Element {
  const activity = useActivity()
  const config = useContext(ActivityConfigContext)
  const result = () => activity.resultFor(props.part.id)
  const status = () => toolStatus(props.part, result())
  return (
    <StepShell
      glyph={stepGlyph(status())}
      title={activity.label(props.part)}
      titleClass={status() === 'running' ? SHIMMER : ''}
      autoOpen={status() === 'approval'}
    >
      <ToolCallCard
        part={props.part}
        result={result()}
        ctx={config.ctx()}
        tools={config.tools}
        fallback={config.fallback()}
      />
      <SubCallGroup parent={props.part} subCalls={props.subCalls ?? []} />
    </StepShell>
  )
}

function SubCallGroup(props: {parent: ToolCallPart; subCalls: ToolCallPart[]}): JSX.Element {
  const activity = useActivity()
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(undefined)
  const attention = () =>
    props.subCalls.some((call) => {
      const status = toolStatus(call, activity.resultFor(call.id))
      return status === 'running' || status === 'approval'
    })
  const parentRunning = () => toolStatus(props.parent, activity.resultFor(props.parent.id)) === 'running'
  const open = () => userOpen() ?? (parentRunning() || attention())
  return (
    <Show when={props.subCalls.length > 0}>
      <div class="mt-1.5">
        <Group.Root class={SUB_GROUP_ROOT} streaming={parentRunning()} open={open()} onOpenChange={setUserOpen}>
          <Group.Trigger class={SUB_GROUP_TRIGGER} label="tool call" count={props.subCalls.length} iconSize={12} />
          <Group.Content class={SUB_GROUP_BODY}>
            <Index each={props.subCalls}>{(call) => <ToolStep part={call()} />}</Index>
          </Group.Content>
        </Group.Root>
      </div>
    </Show>
  )
}

function ThinkingStep(props: {part: Extract<MessagePart, {type: 'thinking'}>}): JSX.Element {
  return (
    <StepShell glyph={stepGlyph('complete')} title="Reasoning">
      <div class="text-[length:var(--chat-text-sm)] leading-[1.45] whitespace-pre-wrap [color:var(--chat-text-2)]">
        {props.part.content}
      </div>
    </StepShell>
  )
}

const GROUP_TRIGGER = `group flex w-full items-center gap-2 px-2 py-1.5 rounded-[var(--chat-radius-md)] text-[length:var(--chat-text-sm)] [color:var(--chat-text-2)] cursor-pointer select-none [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] hover:[background:var(--chat-fill-strong)] ${FOCUS_INSET}`
const GROUP_CHEVRON =
  'size-3 shrink-0 ml-auto [transition:rotate_150ms_var(--chat-ease)] group-data-[state=closed]:-rotate-90 group-data-[state=open]:rotate-0'

const SUB_GROUP_ROOT =
  'w-full rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)] overflow-hidden'
const SUB_GROUP_TRIGGER = `group w-full flex items-center gap-2 px-3 py-2 text-[length:var(--chat-text-sm)] [color:var(--chat-text-2)] cursor-pointer select-none [background:transparent] font-medium hover:[background:var(--chat-fill-strong)] ${FOCUS_INSET}`
const SUB_GROUP_BODY = 'flex flex-col gap-2 px-3 pt-3 pb-2 [border-top:1px_solid_var(--chat-line)]'

function stepIndices(turn: Turn, indices: readonly number[]): number[] {
  return indices.filter((index) => {
    const part = turn.parts[index]
    const call = asToolCall(part)
    if (call) return parentToolCallIdOf(call) === null
    return asThinking(part) !== null
  })
}

function StepGroup(props: {turn: Turn; node: GroupNodeGroup; liveSegment: boolean}): JSX.Element {
  const activity = useActivity()
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(undefined)
  const steps = () => stepIndices(props.turn, props.node.indices)
  const hasApproval = () =>
    props.node.indices.some((index) => {
      const call = asToolCall(props.turn.parts[index])
      return call !== null && toolStatus(call, activity.resultFor(call.id)) === 'approval'
    })
  const open = () => userOpen() ?? (props.liveSegment || hasApproval())
  const title = () => {
    const active = props.liveSegment ? activity.activeCall() : null
    if (active) return activity.label(active)
    return `${steps().length} step${steps().length === 1 ? '' : 's'}`
  }
  return (
    <Collapsible.Root open={open()} onOpenChange={(details) => setUserOpen(details.open)}>
      <Collapsible.Trigger class={GROUP_TRIGGER}>
        <Show when={props.liveSegment} fallback={<span class="shrink-0 size-3" aria-hidden="true" />}>
          <Loader size={12} class={SPIN} aria-hidden="true" />
        </Show>
        <span class={`font-medium text-left flex-1 min-w-0 truncate ${props.liveSegment ? SHIMMER : ''}`}>
          {title()}
        </span>
        <ChevronDown size={12} class={GROUP_CHEVRON} aria-hidden="true" />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div class="pt-1 flex flex-col gap-0.5 min-w-0">
          <Index each={steps()}>
            {(partIndex) => (
              <Switch>
                <Match when={asToolCall(props.turn.parts[partIndex()])}>
                  {(part) => <ToolStep part={part()} subCalls={childCallsFor(props.turn.parts, part().id)} />}
                </Match>
                <Match when={asThinking(props.turn.parts[partIndex()])}>
                  {(part) => <ThinkingStep part={part()} />}
                </Match>
              </Switch>
            )}
          </Index>
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

function asText(part: MessagePart | undefined): Extract<MessagePart, {type: 'text'}> | null {
  return part?.type === 'text' && part.content.trim().length > 0 ? part : null
}

function userText(turn: Turn): string {
  return turn.parts
    .map((part) => (part.type === 'text' ? part.content : ''))
    .join('\n')
    .trim()
}

function AssistantTurnView(props: {turn: Turn}): JSX.Element {
  const activity = useActivity()
  const config = useContext(ActivityConfigContext)
  const grouping = createMemo(() => config.grouping() ?? createGrouping(config.pageSession(), config.tools()))
  const nodes = createMemo(() => groupParts(props.turn.parts, grouping().grouper, grouping().context))
  const groupEntries = createMemo<GroupEntry[]>(() => {
    const chain: GroupEntry = {
      key: CHAIN_GROUP_KEY,
      render: (groupProps) => <StepGroup turn={props.turn} node={groupProps.node} liveSegment={groupProps.streaming} />,
    }
    const pageSession = config.pageSession()
    return [chain, ...(pageSession ? [pageSession.entry] : []), ...config.groupEntries()]
  })
  const hasSteps = (node: GroupNodeGroup): boolean =>
    node.key !== CHAIN_GROUP_KEY || stepIndices(props.turn, node.indices).length > 0
  const asGroup = (node: GroupNode): GroupNodeGroup | null => {
    if (node.type !== 'group' || !hasSteps(node)) return null
    return groupEntryFor(groupEntries(), node.key) === undefined ? null : node
  }
  const asFlattened = (node: GroupNode): GroupNodeGroup | null => {
    if (node.type !== 'group' || !hasSteps(node)) return null
    return groupEntryFor(groupEntries(), node.key) === undefined ? node : null
  }
  const asLeaf = (node: GroupNode): GroupNodePart | null => (node.type === 'part' ? node : null)
  const renderable = (node: GroupNode): boolean => {
    if (asLeaf(node) !== null || asGroup(node) !== null) return true
    const flattened = asFlattened(node)
    return flattened !== null && flattened.children.some(renderable)
  }
  const PartLeaf = (leafProps: {node: GroupNodePart}): JSX.Element => (
    <Switch>
      <Match when={asText(props.turn.parts[leafProps.node.index])}>
        {(part) => <Markdown content={part().content} />}
      </Match>
      <Match when={asToolCall(props.turn.parts[leafProps.node.index])}>
        {(part) => (
          <ToolCallCard
            part={part()}
            result={activity.resultFor(part().id)}
            ctx={config.ctx()}
            tools={config.tools}
            fallback={config.fallback()}
          />
        )}
      </Match>
    </Switch>
  )
  const NodeView = (nodeProps: {node: GroupNode; streaming: boolean}): JSX.Element => (
    <Switch>
      <Match when={asGroup(nodeProps.node)}>
        {(group) => (
          <Show when={groupEntryFor(groupEntries(), group().key)}>
            {(entry) => (
              <Dynamic
                component={entry().render}
                node={group()}
                parts={() => props.turn.parts}
                resultFor={activity.resultFor}
                streaming={nodeProps.streaming}
              >
                <NodeListView nodes={group().children} streaming={nodeProps.streaming} />
              </Dynamic>
            )}
          </Show>
        )}
      </Match>
      <Match when={asFlattened(nodeProps.node)}>
        {(group) => <NodeListView nodes={group().children} streaming={nodeProps.streaming} />}
      </Match>
      <Match when={asLeaf(nodeProps.node)}>{(leaf) => <PartLeaf node={leaf()} />}</Match>
    </Switch>
  )
  const NodeListView = (listProps: {nodes: readonly GroupNode[]; streaming: boolean}): JSX.Element => {
    const lastRenderableIndex = createMemo(() => listProps.nodes.map(renderable).lastIndexOf(true))
    return (
      <Index each={listProps.nodes}>
        {(node, index) => <NodeView node={node()} streaming={listProps.streaming && index === lastRenderableIndex()} />}
      </Index>
    )
  }
  return (
    <div data-pw-msg class="flex flex-col gap-1.5 min-w-0 self-stretch anim-msg">
      <NodeListView nodes={nodes()} streaming={activity.live() && activity.isLastTurn(props.turn)} />
    </div>
  )
}

function UserTurnView(props: {turn: Turn}): JSX.Element {
  return (
    <Show when={userText(props.turn)}>
      {(text) => (
        <div
          data-pw-msg
          class="text-[length:var(--chat-text-sm)] leading-[1.45] px-2.5 py-1.5 rounded-[var(--chat-radius-md)] max-w-[85%] [background:var(--chat-accent)] [color:var(--chat-on-accent)] [overflow-wrap:anywhere] self-end anim-msg"
        >
          {text()}
        </div>
      )}
    </Show>
  )
}

function Timeline(props: {id?: string; 'aria-label'?: string; class?: string; children?: JSX.Element}): JSX.Element {
  const activity = useActivity()
  const [viewport, setViewport] = createSignal<HTMLElement>()
  useThreadAutoScroll(viewport, {autoScroll: () => true})
  return (
    <div
      ref={setViewport}
      id={props.id}
      aria-label={props['aria-label']}
      class={`px-2.5 py-2.5 flex flex-1 flex-col gap-2.5 min-h-0 min-w-0 overflow-y-auto ${props.class ?? ''}`}
      role="log"
      aria-live="polite"
    >
      <Index each={activity.turns()}>
        {(turn) => (
          <Show when={turn().role === 'user'} fallback={<AssistantTurnView turn={turn()} />}>
            <UserTurnView turn={turn()} />
          </Show>
        )}
      </Index>
      {props.children}
    </div>
  )
}

export const Activity = Object.assign(Root, {Root, Timeline})
