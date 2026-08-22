import {createSignal, Show, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, fn, within, userEvent, waitFor} from 'storybook/test'
import ClipboardCopy from 'lucide-solid/icons/clipboard-copy'
import Crosshair from 'lucide-solid/icons/crosshair'
import Ellipsis from 'lucide-solid/icons/ellipsis'
import FoldVertical from 'lucide-solid/icons/fold-vertical'
import MessageSquarePlus from 'lucide-solid/icons/message-square-plus'
import Presentation from 'lucide-solid/icons/presentation'
import RotateCw from 'lucide-solid/icons/rotate-cw'
import SquarePen from 'lucide-solid/icons/square-pen'
import SquareTerminal from 'lucide-solid/icons/square-terminal'
import {Switch, TooltipIconButton} from '@conciv/ui-kit-system'
import {ComposerActions, ComposerActionsHost} from './composer-actions.js'

const meta: Meta = {title: 'ui-kit-chat/primitives/ComposerActions'}
export default meta
type Story = StoryObj

const GRAB_LABEL = 'Select an element from the page'
const NEW_SESSION_LABEL = 'Start a new session'
const COMPACT_LABEL = 'Compress the conversation'
const CANVAS_LABEL = 'Open the whiteboard canvas'
const COMMENT_LABEL = 'Comment on an element'
const OPEN_LABEL = 'Open in Claude Code'
const COPY_LABEL = 'Copy command'
const RETRY_LABEL = 'Launch options unavailable: retry'
const LAUNCH_LABEL = 'Launch the session in a terminal'
const OVERFLOW_LABEL = 'More composer actions'
const DISABLED_TOGGLE = 'Disable both actions'
const UNAVAILABLE_TOGGLE = 'Launch options unavailable'

function StoryToggle(props: {label: string; checked: boolean; onChange: (checked: boolean) => void}): JSX.Element {
  return (
    <Switch.Root checked={props.checked} onCheckedChange={(details) => props.onChange(details.checked)}>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      <Switch.Label>{props.label}</Switch.Label>
      <Switch.HiddenInput />
    </Switch.Root>
  )
}

function SlotPlaceholder(): JSX.Element {
  return <span aria-hidden="true" class="rounded-chat-surface-sm bg-chat-fill shrink-0 size-8.5 block" />
}

function ActionsFrame(props: {
  width: number
  maxInlineAuto?: number
  resizable?: boolean
  children: JSX.Element
}): JSX.Element {
  return (
    <div
      class="p-2 border border-chat-line rounded-chat-surface-md bg-chat-panel overflow-hidden"
      style={
        props.resizable === true
          ? {width: `${props.width}px`, resize: 'horizontal', 'min-inline-size': '160px', 'max-inline-size': '720px'}
          : {width: `${props.width}px`}
      }
    >
      <ComposerActionsHost maxInlineAuto={props.maxInlineAuto}>
        <ComposerActions.Trigger>
          <Ellipsis class="size-5 block" aria-hidden="true" />
        </ComposerActions.Trigger>
        <ComposerActions.Leading>
          <SlotPlaceholder />
        </ComposerActions.Leading>
        <ComposerActions.Trailing>
          <SlotPlaceholder />
        </ComposerActions.Trailing>
        {props.children}
      </ComposerActionsHost>
    </div>
  )
}

function ActionLog(props: {value: string}): JSX.Element {
  return (
    <p aria-live="polite" class="text-[0.75rem] text-chat-text-2 min-h-4">
      <Show when={props.value !== ''} fallback="No action taken yet">
        {`Last action: ${props.value}`}
      </Show>
    </p>
  )
}

function GrabAction(props: {onAction: (label: string) => void; disabled?: () => boolean; busy?: boolean}): JSX.Element {
  return (
    <ComposerActions.ActionButton
      priority={40}
      visible="always"
      disabled={props.disabled}
      tooltip={GRAB_LABEL}
      busy={props.busy}
      onClick={() => props.onAction(GRAB_LABEL)}
    >
      <Crosshair class="size-5 block" aria-hidden="true" />
    </ComposerActions.ActionButton>
  )
}

function NewSessionAction(props: {onAction: (label: string) => void; pinned?: boolean}): JSX.Element {
  return (
    <ComposerActions.ActionButton
      priority={30}
      visible={props.pinned === true ? 'always' : 'auto'}
      tooltip={NEW_SESSION_LABEL}
      onClick={() => props.onAction(NEW_SESSION_LABEL)}
    >
      <SquarePen class="size-5 block" aria-hidden="true" />
    </ComposerActions.ActionButton>
  )
}

function CompactAction(props: {onAction: (label: string) => void; disabled?: () => boolean}): JSX.Element {
  return (
    <ComposerActions.ActionButton
      priority={20}
      disabled={props.disabled}
      tooltip={COMPACT_LABEL}
      onClick={() => props.onAction(COMPACT_LABEL)}
    >
      <FoldVertical class="size-5 block" aria-hidden="true" />
    </ComposerActions.ActionButton>
  )
}

function CanvasAction(props: {onAction: (label: string) => void; pinned?: boolean}): JSX.Element {
  return (
    <ComposerActions.ActionButton
      priority={15}
      visible={props.pinned === true ? 'always' : 'auto'}
      tooltip={CANVAS_LABEL}
      onClick={() => props.onAction(CANVAS_LABEL)}
    >
      <Presentation class="size-5 block" aria-hidden="true" />
    </ComposerActions.ActionButton>
  )
}

function CommentAction(props: {onAction: (label: string) => void}): JSX.Element {
  return (
    <ComposerActions.Action priority={5}>
      <ComposerActions.ActionMenuItem label={COMMENT_LABEL} onSelect={() => props.onAction(COMMENT_LABEL)}>
        <MessageSquarePlus class="size-4 block" aria-hidden="true" />
      </ComposerActions.ActionMenuItem>
    </ComposerActions.Action>
  )
}

function LaunchAction(props: {onAction: (label: string) => void; optionsUnavailable?: boolean}): JSX.Element {
  return (
    <ComposerActions.Action priority={10}>
      <ComposerActions.Inline>
        <TooltipIconButton tooltip={LAUNCH_LABEL} class="size-8.5" onClick={() => props.onAction(LAUNCH_LABEL)}>
          <SquareTerminal class="size-5 block" aria-hidden="true" />
        </TooltipIconButton>
      </ComposerActions.Inline>
      <Show
        when={props.optionsUnavailable === true}
        fallback={
          <>
            <ComposerActions.ActionMenuItem label={OPEN_LABEL} onSelect={() => props.onAction(OPEN_LABEL)}>
              <SquareTerminal class="size-4 block" aria-hidden="true" />
            </ComposerActions.ActionMenuItem>
            <ComposerActions.ActionMenuItem label={COPY_LABEL} onSelect={() => props.onAction(COPY_LABEL)}>
              <ClipboardCopy class="size-4 block" aria-hidden="true" />
            </ComposerActions.ActionMenuItem>
          </>
        }
      >
        <ComposerActions.ActionMenuItem label={RETRY_LABEL} onSelect={() => props.onAction(RETRY_LABEL)}>
          <RotateCw class="size-4 block" aria-hidden="true" />
        </ComposerActions.ActionMenuItem>
      </Show>
    </ComposerActions.Action>
  )
}

export const AllInline: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    return (
      <div class="flex flex-col gap-2">
        <ActionsFrame width={560}>
          <GrabAction onAction={setLast} busy />
          <NewSessionAction onAction={setLast} />
          <CompactAction onAction={setLast} />
          <CanvasAction onAction={setLast} />
          <LaunchAction onAction={setLast} />
        </ActionsFrame>
        <ActionLog value={last()} />
      </div>
    )
  },
}

export const Collapsed: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    return (
      <div class="flex flex-col gap-2">
        <ActionsFrame width={180}>
          <GrabAction onAction={setLast} />
          <NewSessionAction onAction={setLast} />
          <CompactAction onAction={setLast} />
          <CanvasAction onAction={setLast} />
          <LaunchAction onAction={setLast} />
        </ActionsFrame>
        <ActionLog value={last()} />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const trigger = await waitFor(() => canvas.getByRole('button', {name: OVERFLOW_LABEL}))
    await expect(canvas.getByRole('button', {name: GRAB_LABEL})).toBeVisible()
    await expect(canvas.queryByRole('button', {name: COMPACT_LABEL})).toBeNull()
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu')

    await userEvent.click(trigger)
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'))
    await waitFor(() =>
      expect(canvas.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        NEW_SESSION_LABEL,
        COMPACT_LABEL,
        CANVAS_LABEL,
        OPEN_LABEL,
        COPY_LABEL,
      ]),
    )

    await userEvent.click(canvas.getByRole('menuitem', {name: COMPACT_LABEL}))
    await waitFor(() => expect(canvas.getByText(`Last action: ${COMPACT_LABEL}`)).toBeVisible())
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'))
  },
}

export const CappedDefault: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    return (
      <div class="flex flex-col gap-2">
        <p class="text-[0.75rem] text-chat-text-2">
          The app default: a wide row still keeps every auto action in the overflow menu, pinned actions aside.
        </p>
        <ActionsFrame width={560} maxInlineAuto={0}>
          <GrabAction onAction={setLast} />
          <NewSessionAction onAction={setLast} />
          <CompactAction onAction={setLast} />
          <CanvasAction onAction={setLast} />
          <LaunchAction onAction={setLast} />
        </ActionsFrame>
        <ActionLog value={last()} />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const trigger = await waitFor(() => canvas.getByRole('button', {name: OVERFLOW_LABEL}))
    await expect(canvas.getByRole('button', {name: GRAB_LABEL})).toBeVisible()
    await expect(canvas.queryByRole('button', {name: NEW_SESSION_LABEL})).toBeNull()
    await expect(canvas.queryByRole('button', {name: COMPACT_LABEL})).toBeNull()

    await userEvent.click(trigger)
    await waitFor(() =>
      expect(canvas.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        NEW_SESSION_LABEL,
        COMPACT_LABEL,
        CANVAS_LABEL,
        OPEN_LABEL,
        COPY_LABEL,
      ]),
    )

    await userEvent.click(canvas.getByRole('menuitem', {name: NEW_SESSION_LABEL}))
    await waitFor(() => expect(canvas.getByText(`Last action: ${NEW_SESSION_LABEL}`)).toBeVisible())
  },
}

export const PinnedOnly: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    return (
      <div class="flex flex-col gap-2">
        <ActionsFrame width={210}>
          <GrabAction onAction={setLast} />
          <CanvasAction onAction={setLast} pinned />
          <NewSessionAction onAction={setLast} />
          <CompactAction onAction={setLast} />
        </ActionsFrame>
        <ActionLog value={last()} />
      </div>
    )
  },
}

export const MenuOnlyAction: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    return (
      <div class="flex flex-col gap-2">
        <ActionsFrame width={560}>
          <GrabAction onAction={setLast} />
          <NewSessionAction onAction={setLast} />
          <CompactAction onAction={setLast} />
          <CommentAction onAction={setLast} />
        </ActionsFrame>
        <ActionLog value={last()} />
      </div>
    )
  },
}

export const PairedMenuItems: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    const [unavailable, setUnavailable] = createSignal(false)
    return (
      <div class="flex flex-col gap-2">
        <ActionsFrame width={170}>
          <NewSessionAction onAction={setLast} />
          <CompactAction onAction={setLast} />
          <LaunchAction onAction={setLast} optionsUnavailable={unavailable()} />
        </ActionsFrame>
        <StoryToggle label={UNAVAILABLE_TOGGLE} checked={unavailable()} onChange={setUnavailable} />
        <ActionLog value={last()} />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const canvas = within(canvasElement)
    const trigger = await waitFor(() => canvas.getByRole('button', {name: OVERFLOW_LABEL}))
    await waitFor(() => expect(canvas.getByRole('button', {name: NEW_SESSION_LABEL})).toBeVisible())

    await userEvent.click(trigger)
    await waitFor(() =>
      expect(canvas.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        COMPACT_LABEL,
        OPEN_LABEL,
        COPY_LABEL,
      ]),
    )

    await userEvent.click(canvas.getByRole('menuitem', {name: COPY_LABEL}))
    await waitFor(() => expect(canvas.getByText(`Last action: ${COPY_LABEL}`)).toBeVisible())

    await userEvent.click(canvas.getByText(UNAVAILABLE_TOGGLE))
    await userEvent.click(trigger)
    await waitFor(() =>
      expect(canvas.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([COMPACT_LABEL, RETRY_LABEL]),
    )
  },
}

const disabledSelectSpy = fn()

export const DisabledAction: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    const [disabled, setDisabled] = createSignal(true)
    const record = (label: string): void => {
      disabledSelectSpy(label)
      setLast(label)
    }
    return (
      <div class="flex flex-col gap-2">
        <ActionsFrame width={170}>
          <GrabAction onAction={record} disabled={disabled} />
          <NewSessionAction onAction={record} />
          <CompactAction onAction={record} disabled={disabled} />
        </ActionsFrame>
        <StoryToggle label={DISABLED_TOGGLE} checked={disabled()} onChange={setDisabled} />
        <ActionLog value={last()} />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    disabledSelectSpy.mockClear()
    const canvas = within(canvasElement)
    const trigger = await waitFor(() => canvas.getByRole('button', {name: OVERFLOW_LABEL}))
    await waitFor(() => expect(canvas.getByRole('button', {name: GRAB_LABEL})).toBeDisabled())

    await userEvent.click(trigger)
    const item = await waitFor(() => canvas.getByRole('menuitem', {name: COMPACT_LABEL}))
    await expect(item).toHaveAttribute('aria-disabled', 'true')

    await userEvent.click(item)
    await expect(disabledSelectSpy).not.toHaveBeenCalled()
    await expect(canvas.getByText('No action taken yet')).toBeVisible()

    await userEvent.keyboard('{Escape}')
    await userEvent.click(canvas.getByText(DISABLED_TOGGLE))
    await waitFor(() => expect(canvas.getByRole('button', {name: GRAB_LABEL})).toBeEnabled())

    await userEvent.click(trigger)
    const enabledItem = await waitFor(() => canvas.getByRole('menuitem', {name: COMPACT_LABEL}))
    await expect(enabledItem).not.toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(enabledItem)
    await waitFor(() => expect(canvas.getByText(`Last action: ${COMPACT_LABEL}`)).toBeVisible())
  },
}

export const ResizablePlayground: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    return (
      <div class="flex flex-col gap-2">
        <p class="text-[0.75rem] text-chat-text-2">
          Drag the bottom-right corner to watch actions collapse and expand.
        </p>
        <ActionsFrame width={420} resizable>
          <GrabAction onAction={setLast} />
          <NewSessionAction onAction={setLast} />
          <CompactAction onAction={setLast} />
          <CanvasAction onAction={setLast} />
          <LaunchAction onAction={setLast} />
        </ActionsFrame>
        <ActionLog value={last()} />
      </div>
    )
  },
}
