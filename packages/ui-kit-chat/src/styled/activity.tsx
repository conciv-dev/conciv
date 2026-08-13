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
import type {ToolCardEntry, ToolUIComponent, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {Collapsible} from '@conciv/ui-kit-system'
import {INERT_TOOL_CTX} from '../store/tool-context.js'
import {Activity as ActivityPrimitive, useActivity, type ActivityLabeler} from '../primitives/activity/activity.js'
import {
  childCallsFor,
  groupSegments,
  parentToolCallIdOf,
  type ChainSegment,
  type Segment,
  type Turn,
} from '../store/grouping.js'
import {
  pageSessionCallParts,
  pageSessionGroupingOptions,
  pageSessionHasSteps,
  pageSessionThinkingParts,
  type PageSessionConfig,
} from '../store/page-session.js'
import {Dynamic} from 'solid-js/web'
import {toolStatus, type ToolStatus} from '../tools/primitives/tool-status.js'
import {useThreadAutoScroll} from '../behaviors/use-thread-auto-scroll.js'
import {ToolCallCard} from '../tools/styled/tool-call-card.js'
import {ToolGroup} from '../tools/styled/tool-group.js'
import {ToolFallback} from '../tools/styled/tool-fallback.js'
import {Markdown} from './markdown.js'
import {NowLine} from './now-line.js'
import {SHIMMER} from './shimmer.js'
import {FOCUS_INSET, SPIN} from './classes.js'

type ActivityConfig = {
  tools: () => ToolCardEntry[]
  fallback: () => ToolUIComponent
  ctx: () => ToolViewCtx
  pageSession: () => PageSessionConfig | undefined
}

const ActivityConfigContext = createContext<ActivityConfig>({
  tools: () => [],
  fallback: () => ToolFallback,
  ctx: () => ({...INERT_TOOL_CTX, respondApproval: () => {}}),
  pageSession: () => undefined,
})

export type ActivityProps = ParentProps<{
  messages: UIMessage[]
  live?: boolean
  label?: ActivityLabeler
  tools?: ToolCardEntry[]
  ctx?: ToolViewCtx
  fallback?: ToolUIComponent
  pageSession?: PageSessionConfig
  class?: string
}>

function Root(props: ActivityProps): JSX.Element {
  const parent = useContext(ActivityConfigContext)
  return (
    <ActivityPrimitive.Root messages={props.messages} live={props.live} label={props.label}>
      <ActivityConfigContext.Provider
        value={{
          tools: () => props.tools ?? [],
          fallback: () => props.fallback ?? ToolFallback,
          ctx: () => props.ctx ?? parent.ctx(),
          pageSession: () => props.pageSession ?? parent.pageSession(),
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
        <X size={12} class="text-[color:var(--chat-danger)] shrink-0" aria-hidden="true" />
      </Match>
      <Match when={status === 'approval'}>
        <ShieldQuestion size={12} class="text-[color:var(--chat-accent)] shrink-0" aria-hidden="true" />
      </Match>
      <Match when={status === 'complete'}>
        <Check size={12} class="text-[color:var(--chat-success)] shrink-0" aria-hidden="true" />
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
  props: ParentProps<{glyph: JSX.Element; title: string; titleClass?: string; defaultOpen?: boolean}>,
): JSX.Element {
  return (
    <Collapsible.Root defaultOpen={props.defaultOpen}>
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
      defaultOpen={status() === 'approval'}
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
        <ToolGroup count={props.subCalls.length} active={parentRunning()} open={open()} onOpenChange={setUserOpen}>
          <Index each={props.subCalls}>{(call) => <ToolStep part={call()} />}</Index>
        </ToolGroup>
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

function stepIndices(turn: Turn, chain: ChainSegment): number[] {
  return chain.indices.filter((index) => {
    const part = turn.parts[index]
    const call = asToolCall(part)
    if (call) return parentToolCallIdOf(call) === null
    return asThinking(part) !== null
  })
}

function StepGroup(props: {turn: Turn; chain: ChainSegment; liveSegment: boolean}): JSX.Element {
  const activity = useActivity()
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(undefined)
  const steps = () => stepIndices(props.turn, props.chain)
  const hasApproval = () =>
    props.chain.indices.some((index) => {
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
  const standaloneNames = createMemo(() => {
    const names = new Set<string>()
    for (const entry of config.tools())
      if (entry.display === 'standalone') for (const name of entry.names) names.add(name)
    return names
  })
  const isStandaloneTool = (name: string) => standaloneNames().has(name)
  const groupingOptions = createMemo(() => ({
    ...pageSessionGroupingOptions(config.pageSession()),
    standalone: isStandaloneTool,
  }))
  const segments = createMemo(() => groupSegments(props.turn.parts, groupingOptions()))
  const visibleChain = (segment: Segment): ChainSegment | null => {
    const chain = segment.kind === 'chain' ? segment : null
    return chain && stepIndices(props.turn, chain).length > 0 ? chain : null
  }
  const asPageSession = (segment: Segment) => {
    const pageSession = config.pageSession()
    if (!pageSession || segment.kind !== 'page-session') return null
    return pageSessionHasSteps(props.turn.parts, segment.indices, pageSession.actNames) ? segment : null
  }
  const asReply = (segment: Segment) => (segment.kind === 'reply' ? segment : null)
  const asStandalone = (segment: Segment) => (segment.kind === 'standalone' ? segment : null)
  const renderable = (segment: Segment): boolean =>
    asReply(segment) !== null ||
    asPageSession(segment) !== null ||
    visibleChain(segment) !== null ||
    asStandalone(segment) !== null
  const lastRenderableIndex = createMemo(() => {
    let last = -1
    for (const [index, segment] of segments().entries()) if (renderable(segment)) last = index
    return last
  })
  const liveSegment = (index: number) =>
    activity.live() && activity.isLastTurn(props.turn) && index === lastRenderableIndex()
  return (
    <div data-pw-msg class="flex flex-col gap-1.5 min-w-0 self-stretch anim-msg">
      <Index each={segments()}>
        {(segment, index) => (
          <Switch>
            <Match when={visibleChain(segment())}>
              {(chain) => <StepGroup turn={props.turn} chain={chain()} liveSegment={liveSegment(index)} />}
            </Match>
            <Match when={asReply(segment())}>
              {(reply) => (
                <Show when={asText(props.turn.parts[reply().index])}>
                  {(part) => <Markdown content={part().content} />}
                </Show>
              )}
            </Match>
            <Match when={asStandalone(segment())}>
              {(standalone) => (
                <Show when={asToolCall(props.turn.parts[standalone().index])}>
                  {(part) => (
                    <ToolCallCard
                      part={part()}
                      result={activity.resultFor(part().id)}
                      ctx={config.ctx()}
                      tools={config.tools}
                      fallback={config.fallback()}
                    />
                  )}
                </Show>
              )}
            </Match>
            <Match when={asPageSession(segment())}>
              {(session) => (
                <Show when={config.pageSession()}>
                  {(pageSession) => (
                    <Dynamic
                      component={pageSession().render}
                      parts={pageSessionCallParts(props.turn.parts, session().indices)}
                      thinking={pageSessionThinkingParts(props.turn.parts, session().indices)}
                      resultFor={activity.resultFor}
                      streaming={liveSegment(index)}
                    />
                  )}
                </Show>
              )}
            </Match>
          </Switch>
        )}
      </Index>
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

function Now(props: {onStop?: () => void; class?: string}): JSX.Element {
  const activity = useActivity()
  const title = () => {
    const call = activity.activeCall()
    return activity.live() && call ? activity.label(call) : null
  }
  return (
    <Show when={title()}>
      {(text) => (
        <div class={`px-2.5 pb-2.5 shrink-0 ${props.class ?? ''}`}>
          <NowLine title={text()} onStop={props.onStop} />
        </div>
      )}
    </Show>
  )
}

export const Activity = Object.assign(Root, {Root, Timeline, Now})
