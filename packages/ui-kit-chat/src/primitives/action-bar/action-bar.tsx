import {
  createContext,
  createEffect,
  createSignal,
  Show,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js'
import {makeTimer} from '@solid-primitives/timer'
import {Primitive, type Slottable} from '../util/primitive.js'
import {useChatContext, useThread} from '../../store/chat-context.js'
import {useMessage} from '../message/message-context.js'
import {createActionButton, type ActionButtonState} from '../util/create-action-button.js'
import type {Turn} from '../../store/grouping.js'
import {useActionHandlers} from './action-handlers.js'
import {ActionBarInteractionProvider} from './interaction-context.js'

const CopiedContext = createContext<Accessor<boolean>>()

export function useCopied(): Accessor<boolean> {
  return useContext(CopiedContext) ?? (() => false)
}

function messageText(turn: Turn): string {
  return turn.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part.type === 'text' ? part.content : ''))
    .join('\n\n')
}

function messageMarkdown(turn: Turn): string {
  return turn.parts
    .map((part) => {
      if (part.type === 'text') return part.content
      if (part.type === 'thinking') return `> ${part.content}`
      if (part.type === 'tool-call') return `\`\`\`\n${part.name}(${part.arguments})\n\`\`\``
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

type RootProps = JSX.HTMLAttributes<HTMLDivElement> & {
  hideWhenRunning?: boolean
  autohide?: 'always' | 'not-last' | 'never'
  autohideFloat?: 'always' | 'single-branch' | 'never'
}

function Root(props: RootProps): JSX.Element {
  const thread = useThread()
  const message = useMessage()
  const chat = useChatContext()
  const [local, rest] = splitProps(props, ['hideWhenRunning', 'autohide', 'autohideFloat'])
  const [interactionCount, setInteractionCount] = createSignal(0)
  const acquireInteractionLock = () => {
    setInteractionCount((count) => count + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      setInteractionCount((count) => Math.max(0, count - 1))
    }
  }
  const hidden = () => Boolean(local.hideWhenRunning) && thread.isRunning
  const autohideEnabled = () => {
    const autohide = local.autohide ?? 'never'
    return autohide === 'always' || (autohide === 'not-last' && !message.isLast())
  }
  const visibleByInteraction = () => interactionCount() > 0 || chat.view.hovering === message.message().key
  const active = () => !autohideEnabled() || visibleByInteraction()
  const floating = () =>
    autohideEnabled() && (local.autohideFloat === 'always' || local.autohideFloat === 'single-branch')
  return (
    <Show when={!hidden()}>
      <ActionBarInteractionProvider value={{acquireInteractionLock}}>
        <div
          data-floating={floating() ? 'true' : undefined}
          data-autohide={autohideEnabled() ? 'true' : undefined}
          data-active={active() ? 'true' : undefined}
          {...rest}
        />
      </ActionBarInteractionProvider>
    </Show>
  )
}

const Reload = createActionButton('Reload', () => {
  const chat = useChatContext()
  const thread = useThread()
  return () => ({run: () => void chat.reload(), disabled: thread.isRunning})
})

type ExportArgs = {filename?: string; onExport?: (markdown: string) => void}

export function useExportMarkdown(args: ExportArgs = {}): () => void {
  const message = useMessage()
  return () => {
    const markdown = messageMarkdown(message.message())
    if (args.onExport) {
      args.onExport(markdown)
      return
    }
    const blob = new Blob([markdown], {type: 'text/markdown'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = args.filename ?? 'message.md'
    anchor.click()
    URL.revokeObjectURL(url)
  }
}

const ExportMarkdown = createActionButton<ExportArgs>('Export markdown', (args) => {
  const run = useExportMarkdown(args)
  return () => ({run: () => run()})
})

const Edit = createActionButton('Edit', () => {
  const message = useMessage()
  const handlers = useActionHandlers()
  return (): ActionButtonState | null => (handlers.onEdit ? {run: () => handlers.onEdit?.(message.message())} : null)
})

const Speak = createActionButton('Speak', () => {
  const message = useMessage()
  const handlers = useActionHandlers()
  return (): ActionButtonState | null => (handlers.onSpeak ? {run: () => handlers.onSpeak?.(message.message())} : null)
})

const StopSpeaking = createActionButton('Stop speaking', () => {
  const handlers = useActionHandlers()
  return (): ActionButtonState | null => (handlers.onStopSpeaking ? {run: () => handlers.onStopSpeaking?.()} : null)
})

const FeedbackPositive = createActionButton('Good response', () => {
  const message = useMessage()
  const handlers = useActionHandlers()
  return (): ActionButtonState | null =>
    handlers.onFeedback ? {run: () => handlers.onFeedback?.(message.message(), 'positive')} : null
})

const FeedbackNegative = createActionButton('Bad response', () => {
  const message = useMessage()
  const handlers = useActionHandlers()
  return (): ActionButtonState | null =>
    handlers.onFeedback ? {run: () => handlers.onFeedback?.(message.message(), 'negative')} : null
})

type CopyProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> &
  Slottable<JSX.ButtonHTMLAttributes<HTMLButtonElement>> & {copiedDuration?: number}

function Copy(props: CopyProps): JSX.Element {
  const message = useMessage()
  const [copiedAt, setCopiedAt] = createSignal<number | null>(null)
  const copied = () => copiedAt() !== null
  const [local, rest] = splitProps(props, ['copiedDuration'])
  const run = () => {
    void navigator.clipboard.writeText(messageText(message.message())).catch(() => {})
    setCopiedAt(performance.now())
  }
  createEffect(() => {
    if (copiedAt() === null) return
    makeTimer(() => setCopiedAt(null), local.copiedDuration ?? 3000, setTimeout)
  })
  return (
    <CopiedContext.Provider value={copied}>
      <Primitive.button
        type="button"
        aria-label="Copy"
        data-copied={copied() ? '' : undefined}
        onClick={run}
        {...rest}
      />
    </CopiedContext.Provider>
  )
}

export const ActionBar = Object.assign(Root, {
  Root,
  Copy,
  Reload,
  Edit,
  ExportMarkdown,
  Speak,
  StopSpeaking,
  FeedbackPositive,
  FeedbackNegative,
})
