import {For, Show, createSignal, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {ToolCallCard, type ToolCallCardProps} from '@conciv/ui-kit-chat'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import {
  Button,
  Dialog as DialogKit,
  Popover as PopoverKit,
  RelativeTime,
  ScrollArea,
  TooltipIconButton,
} from '@conciv/ui-kit-system'
import {MentionField, type MentionFieldApi} from '@conciv/ui-kit-tap'
import {useComments, type Comment} from '../model/comments.js'
import {Avatar, Menu, MenuItem, Tooltip} from '../ui.js'

const HEADER_BTN =
  'inline-flex size-7 items-center justify-center rounded-pw-sm text-pw-text-2 [outline:none] hover:bg-pw-fill focus-ring'
const HEADER_BTN_OFF = `${HEADER_BTN} opacity-30`

const TextPart = z.object({type: z.literal('text'), text: z.string()})
const MentionPart = z.object({type: z.literal('mention'), id: z.string(), label: z.string()})
const ToolPart = z.object({
  type: z.literal('tool'),
  name: z.string(),
  arguments: z.unknown().optional(),
  output: z.unknown().optional(),
})

function renderToolPart(tool: z.output<typeof ToolPart>, key: string, ctx: ToolViewCtx): JSX.Element {
  const callPart: ToolCallCardProps['part'] = {
    type: 'tool-call',
    id: key,
    name: tool.name,
    arguments: JSON.stringify(tool.arguments ?? {}),
    state: 'complete',
    output: tool.output,
  }
  const result: ToolCallCardProps['result'] =
    tool.output === undefined
      ? undefined
      : {type: 'tool-result', toolCallId: key, content: JSON.stringify(tool.output), state: 'complete'}
  return <ToolCallCard part={callPart} result={result} ctx={ctx} tools={() => builtinToolCards} />
}

function renderPart(part: unknown, key: string, ctx: ToolViewCtx): JSX.Element {
  const text = TextPart.safeParse(part)
  if (text.success)
    return <p class="text-[0.8125rem] text-pw-text leading-snug whitespace-pre-wrap">{text.data.text}</p>
  const mention = MentionPart.safeParse(part)
  if (mention.success)
    return (
      <span class="text-[0.8125rem] text-pw-accent-hi px-1 rounded-pw-sm bg-pw-accent-08 inline-flex items-center">
        @{mention.data.label}
      </span>
    )
  const tool = ToolPart.safeParse(part)
  if (tool.success) return renderToolPart(tool.data, key, ctx)
  return <pre class="text-[0.6875rem] text-pw-text-3 overflow-auto">{JSON.stringify(part)}</pre>
}

function CommentRow(props: {comment: Comment}): JSX.Element {
  const model = useComments()
  const parts = (): unknown[] => (Array.isArray(props.comment.parts) ? props.comment.parts : [])
  return (
    <article class="px-3 py-2 border-t border-pw-line-soft flex flex-col gap-1 first:border-t-0">
      <div class="flex gap-2 items-center">
        <Avatar name={model.displayName(props.comment)} src={props.comment.authorAvatar ?? undefined} class="size-6" />
        <span class="text-[0.8125rem] text-pw-text font-medium truncate">{model.displayName(props.comment)}</span>
        <RelativeTime value={new Date(props.comment.createdAt)} class="text-[0.75rem] text-pw-text-3 shrink-0" />
        <Show when={model.ownedBySelf(props.comment)}>
          <span class="ml-auto">
            <Menu
              label="Comment actions"
              trigger={
                <span
                  class="text-pw-text-3 rounded-pw-sm inline-flex size-6 [outline:none] focus-ring items-center justify-center data-[state=open]:bg-pw-fill"
                  aria-label="Comment actions"
                >
                  ⋯
                </span>
              }
              onSelect={(value) => value === 'remove' && model.removeComment(props.comment)}
            >
              <MenuItem value="remove" danger>
                Remove
              </MenuItem>
            </Menu>
          </span>
        </Show>
      </div>
      <div class="pl-8 flex flex-col gap-1">
        <For each={parts()}>{(part, index) => renderPart(part, `${props.comment.cid}-${index()}`, model.ctx)}</For>
      </div>
    </article>
  )
}

function ThreadHeader(props: {onRequestDelete: () => void}): JSX.Element {
  const model = useComments()
  return (
    <header class="px-2 py-1.5 border-b border-pw-line-soft flex gap-0.5 items-center">
      <Tooltip
        label="Previous thread"
        placement="bottom"
        triggerClass={model.canStep(1) ? HEADER_BTN : HEADER_BTN_OFF}
        onClick={() => model.canStep(1) && model.stepThread(1)}
      >
        ‹
      </Tooltip>
      <Tooltip
        label="Next thread"
        placement="bottom"
        triggerClass={model.canStep(-1) ? HEADER_BTN : HEADER_BTN_OFF}
        onClick={() => model.canStep(-1) && model.stepThread(-1)}
      >
        ›
      </Tooltip>
      <span class="flex-1" />
      <Tooltip label="Resolve thread" placement="bottom" triggerClass={HEADER_BTN} onClick={() => model.resolve()}>
        ✓
      </Tooltip>
      <Tooltip
        label="Delete thread"
        placement="bottom"
        triggerClass={`${HEADER_BTN} hover:text-pw-danger`}
        onClick={() => props.onRequestDelete()}
      >
        🗑
      </Tooltip>
      <Tooltip label="Close thread" placement="bottom" triggerClass={HEADER_BTN} onClick={() => model.closeThread()}>
        ✕
      </Tooltip>
    </header>
  )
}

function ThreadComposer(props: {onReady: (api: MentionFieldApi) => void}): JSX.Element {
  const model = useComments()
  const [api, setApi] = createSignal<MentionFieldApi>()
  const [empty, setEmpty] = createSignal(true)
  return (
    <div class="p-2 border-t border-pw-line-soft flex gap-2 items-end">
      <Avatar name="You" class="shrink-0 size-6" />
      <Show when={model.openCid()} keyed>
        {(cid) => (
          <div class="flex-1" data-thread={cid}>
            <MentionField
              ariaLabel="Reply"
              placeholder="Reply, @mention someone…"
              items={(query) => model.participants().filter((p) => p.label.toLowerCase().includes(query.toLowerCase()))}
              onSubmit={model.reply}
              onReady={(value) => {
                setApi(value)
                props.onReady(value)
              }}
              onEmptyChange={setEmpty}
            />
          </div>
        )}
      </Show>
      <TooltipIconButton
        variant="solid"
        tooltip="Send reply"
        disabled={empty()}
        class="rounded-pw-pill shrink-0 size-7"
        onClick={() => api()?.submit()}
      >
        ↑
      </TooltipIconButton>
    </div>
  )
}

export function ThreadPopover(): JSX.Element {
  const model = useComments()
  const Popover = PopoverKit
  const Dialog = DialogKit
  const [confirmDelete, setConfirmDelete] = createSignal(false)
  const [composerEl, setComposerEl] = createSignal<HTMLElement>()
  return (
    <Popover.Root
      open={!!model.rootOf(model.openCid() ?? '')}
      onOpenChange={(detail) => detail.open || model.closeThread()}
      modal={false}
      positioning={{placement: 'right-start', gutter: 8, getAnchorRect: model.anchorRect}}
      initialFocusEl={() => composerEl() ?? null}
      finalFocusEl={model.openPinEl}
    >
      <Popover.Positioner>
        <Popover.Content
          class="flex flex-col max-w-[calc(100vw-2rem)] w-85 overflow-hidden max-sm:w-[calc(100vw-1rem)]"
          aria-label="Comment thread"
        >
          <ThreadHeader onRequestDelete={() => setConfirmDelete(true)} />
          <Dialog open={confirmDelete()} onOpenChange={setConfirmDelete} dismissable label="Delete this thread?">
            <div class="flex flex-col gap-3">
              <div class="flex flex-col gap-1">
                <strong class="text-pw-text">Delete this thread?</strong>
                <p class="text-[0.8125rem] text-pw-text-2">This removes the comment, all its replies, and its pin.</p>
              </div>
              <div class="flex gap-2 justify-end">
                <Button variant="ghost" size="md" aria-label="Cancel" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  aria-label="Delete"
                  onClick={() => {
                    model.deleteThread()
                    setConfirmDelete(false)
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          </Dialog>
          <ScrollArea.Root class="flex-1 min-h-0">
            <ScrollArea.Viewport class="size-full [outline:none]">
              <ScrollArea.Content>
                <For each={model.threadOf(model.openCid() ?? '')}>{(comment) => <CommentRow comment={comment} />}</For>
              </ScrollArea.Content>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar>
              <ScrollArea.Thumb />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
          <Show when={model.rootOf(model.openCid() ?? '')}>
            <ThreadComposer onReady={(api) => setComposerEl(api.element)} />
          </Show>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
