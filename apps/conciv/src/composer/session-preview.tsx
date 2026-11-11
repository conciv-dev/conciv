import {createMemo, createUniqueId, Match, Show, Suspense, Switch, untrack, type JSX} from 'solid-js'
import {useInfiniteQuery, useQuery} from '@conciv/client'
import {
  Button,
  ClipboardCopyButton,
  Kbd,
  Popover,
  TruncatedText,
  useFormatHotkey,
  useHotkeys,
} from '@conciv/ui-kit-system'
import {ChatProvider, MarkdownHighlightProvider, Thread, useThreadViewport, type Chat} from '@conciv/ui-kit-chat'
import type {ChatMessage} from '@conciv/protocol/chat-message-types'
import type {HarnessSessionId} from '@conciv/protocol/chat-types'
import {useAnnounce, useAppData} from '../app/context.js'
import {ConversationSkeleton} from '../pane/indicators.js'
import {createResumeCopy} from './resume-copy.js'

type PreviewTarget = {
  title: string
  project: string
  harness: string
  nativeId: HarnessSessionId
  cwd: string | null
  matched: string[]
  resume: string | null
}

const PAGE_LIMIT = 40
const STALE_MS = 60_000
const GC_MS = 300_000
const READ_ONLY = 'the session preview is read-only'
const FOCUS_THREAD = 'Alt+ArrowRight'
const BACK_TO_SEARCH = 'Alt+ArrowLeft'
const CLOSE = 'Escape'
const RESUME_TOOLTIPS = {idle: 'Copy resume command', copied: 'Copied', failed: 'Copy failed'}
const FROM_THE_INPUT = {enableOnFormTags: true, preventDefault: true}
const FAILED = 'flex items-center gap-2 px-3 py-2 text-chat-danger text-[0.75rem]'
const EARLIER = 'absolute inset-inline-0 top-0 z-1 flex flex-col gap-2 px-5 pt-3 pb-2 bg-chat-panel'

export function SessionPreview(props: {
  target: PreviewTarget | null
  open: boolean
  onDismiss: () => void
  anchor: () => HTMLElement | null
  input: () => HTMLElement | null
}): JSX.Element {
  const titleId = createUniqueId()
  return (
    <Popover.Root
      ids={{title: titleId}}
      open={props.open && props.target !== null}
      onOpenChange={(details) => {
        if (!details.open) props.onDismiss()
      }}
      modal={false}
      autoFocus={false}
      portalled={false}
      lazyMount
      unmountOnExit
      positioning={{placement: 'right-start', flip: ['left-start', 'bottom-start'], getAnchorElement: props.anchor}}
      persistentElements={[props.anchor, props.input]}
      finalFocusEl={props.input}
    >
      <Popover.Positioner>
        <Popover.Content class="w-104 max-w-[calc(100vw-2rem)] overflow-hidden" aria-labelledby={titleId}>
          <Show when={props.target} keyed>
            {(target) => <PreviewBody target={target} input={props.input} />}
          </Show>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}

function PreviewBody(props: {target: PreviewTarget; input: () => HTMLElement | null}): JSX.Element {
  const appData = useAppData()
  const formatHotkey = useFormatHotkey()
  let viewport: HTMLElement | undefined
  const input = (before: string | null) => ({
    harness: props.target.harness,
    nativeId: props.target.nativeId,
    ...(props.target.cwd === null ? {} : {cwd: props.target.cwd}),
    before,
    limit: PAGE_LIMIT,
  })
  const pages = useInfiniteQuery(() => ({
    ...appData.utils.sessions.preview.infiniteOptions({
      input,
      initialPageParam: null,
      getNextPageParam: (page: {earlier: string | null}) => page.earlier,
    }),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: false,
  }))
  useHotkeys({
    commands: [
      {hotkey: FOCUS_THREAD, action: () => viewport?.focus(), options: FROM_THE_INPUT},
      {hotkey: BACK_TO_SEARCH, action: () => props.input()?.focus(), options: FROM_THE_INPUT},
    ],
  })
  return (
    <div class="flex flex-col h-90 anim-combo">
      <header class="px-3 py-2 border-b border-b-chat-line-soft flex gap-2 min-w-0 items-center">
        <Popover.Title class="text-[0.8125rem] text-chat-text-hi font-medium flex-1 min-w-0">
          <span class="sr-only">Preview of </span>
          <TruncatedText text={props.target.title} />
        </Popover.Title>
        <TruncatedText class="text-[0.6875rem] text-chat-text-3 max-w-2/5" text={props.target.project} />
        <Show when={props.target.resume}>{(command) => <ResumeCopyButton command={command()} />}</Show>
      </header>
      <div class="flex flex-1 flex-col min-h-0 [&_mark]:bg-chat-accent-20 [&_mark]:text-chat-text [&_mark]:rounded-chat-chip [&_mark]:[box-shadow:inset_0_-1px_var(--chat-accent)] [&_mark]:anim-mark">
        <Suspense fallback={<PreviewLoading />}>
          <Switch>
            <Match when={pages.isError && pages.data === undefined}>
              <div class={FAILED} role="alert">
                <span class="flex-1">Couldn’t load this session.</span>
                <Button variant="outline-danger" onClick={() => void pages.refetch()}>
                  Retry
                </Button>
              </div>
            </Match>
            <Match when={pages.isLoading}>
              <PreviewLoading />
            </Match>
            <Match when={pages.data}>
              {(data) => (
                <PreviewThread
                  windows={data().pages}
                  matched={props.target.matched}
                  sessionKey={`${props.target.harness}:${props.target.nativeId}`}
                  more={pages.hasNextPage}
                  loading={pages.isFetchingNextPage}
                  failed={pages.isFetchNextPageError}
                  load={() => pages.fetchNextPage().then(() => true)}
                  onViewport={(element) => {
                    viewport = element
                  }}
                />
              )}
            </Match>
          </Switch>
        </Suspense>
      </div>
      <footer class="text-[0.6875rem] text-chat-text-3 px-3 py-1.5 border-t border-t-chat-line-soft flex gap-3 items-center">
        <span>
          <Kbd>{formatHotkey(FOCUS_THREAD)}</Kbd> read
        </span>
        <span>
          <Kbd>{formatHotkey(BACK_TO_SEARCH)}</Kbd> search
        </span>
        <span>
          <Kbd>{formatHotkey(CLOSE)}</Kbd> close
        </span>
      </footer>
    </div>
  )
}

function ResumeCopyButton(props: {command: string}): JSX.Element {
  const announce = useAnnounce()
  const resume = createResumeCopy(() => props.command, announce)
  return (
    <ClipboardCopyButton
      clipboard={resume}
      tooltips={RESUME_TOOLTIPS}
      class="size-7 shrink-0 relative after:absolute after:-inset-2 after:content-['']"
    />
  )
}

function PreviewThread(props: {
  windows: readonly {messages: ChatMessage[]}[]
  matched: string[]
  sessionKey: string
  more: boolean
  loading: boolean
  failed: boolean
  load: () => Promise<boolean>
  onViewport: (element: HTMLElement) => void
}): JSX.Element {
  const matched = untrack(() => props.matched)
  const messages = createMemo(() => props.windows.toReversed().flatMap((window) => window.messages))
  const readOnly = () => Promise.reject(new Error(READ_ONLY))
  const chat: Chat = {
    messages,
    error: () => undefined,
    queue: () => [],
    cancelQueued: () => {},
    sendMessage: readOnly,
    stop: () => {},
    reload: readOnly,
    status: () => 'ready',
    sessionGenerating: () => false,
  }
  return (
    <MarkdownHighlightProvider value={matched}>
      <ChatProvider chat={chat}>
        <Thread>
          <Thread.Viewport ref={props.onViewport}>
            <EarlierMessages
              sessionKey={props.sessionKey}
              oldest={messages()[0]?.id ?? null}
              more={props.more}
              loading={props.loading}
              failed={props.failed}
              load={props.load}
            />
            <Thread.Messages readOnly />
          </Thread.Viewport>
        </Thread>
      </ChatProvider>
    </MarkdownHighlightProvider>
  )
}

function PreviewLoading(): JSX.Element {
  return (
    <div class="px-5 pt-3">
      <ConversationSkeleton label="Loading session preview" />
    </div>
  )
}

function EarlierMessages(props: {
  sessionKey: string
  oldest: string | null
  more: boolean
  loading: boolean
  failed: boolean
  load: () => Promise<boolean>
}): JSX.Element {
  const viewport = useThreadViewport()
  const wanted = () => viewport.isNearTop() && props.more && !props.loading && !props.failed
  useQuery(() => ({
    queryKey: ['session-preview-earlier', props.sessionKey, props.oldest],
    queryFn: props.load,
    enabled: wanted(),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  }))
  return (
    <>
      <Show when={props.loading}>
        <div class={EARLIER}>
          <ConversationSkeleton label="Loading earlier messages" />
        </div>
      </Show>
      <Show when={props.failed}>
        <div class={EARLIER}>
          <div class={FAILED} role="alert">
            <span class="flex-1">Couldn’t load earlier messages.</span>
            <Button variant="outline-danger" onClick={() => void props.load()}>
              Retry
            </Button>
          </div>
        </div>
      </Show>
    </>
  )
}
