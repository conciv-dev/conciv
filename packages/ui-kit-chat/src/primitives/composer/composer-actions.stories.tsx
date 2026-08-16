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
const RETRY_LABEL = 'Launch options unavailable — retry'
const LAUNCH_LABEL = 'Launch the session in a terminal'
const OVERFLOW_LABEL = 'More composer actions'
const DISABLED_TOGGLE = 'Disable both roots'
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
  return <span aria-hidden="true" class="rounded-pw-sm bg-pw-fill shrink-0 size-8.5 block" />
}

function ActionsFrame(props: {width: number; resizable?: boolean; children: JSX.Element}): JSX.Element {
  return (
    <div
      class="p-2 border border-pw-line rounded-pw-md bg-pw-panel overflow-hidden"
      style={
        props.resizable === true
          ? {width: `${props.width}px`, resize: 'horizontal', 'min-inline-size': '160px', 'max-inline-size': '720px'}
          : {width: `${props.width}px`}
      }
    >
      <ComposerActionsHost
        triggerContent={<Ellipsis class="size-5 block" aria-hidden="true" />}
        leading={<SlotPlaceholder />}
        trailing={<SlotPlaceholder />}
      >
        {props.children}
      </ComposerActionsHost>
    </div>
  )
}

function ActionLog(props: {value: string}): JSX.Element {
  return (
    <p aria-live="polite" class="text-[0.75rem] text-pw-text-2 min-h-4">
      <Show when={props.value !== ''} fallback="No action taken yet">
        {`Last action: ${props.value}`}
      </Show>
    </p>
  )
}

function GrabRoot(props: {onAction: (label: string) => void; disabled?: () => boolean; busy?: boolean}): JSX.Element {
  return (
    <ComposerActions.Root id="story.grab" priority={40} disabled={props.disabled}>
      <ComposerActions.Button
        visible="always"
        tooltip={GRAB_LABEL}
        busy={props.busy}
        onClick={() => props.onAction(GRAB_LABEL)}
      >
        <Crosshair class="size-5 block" aria-hidden="true" />
      </ComposerActions.Button>
    </ComposerActions.Root>
  )
}

function NewSessionRoot(props: {onAction: (label: string) => void; pinned?: boolean}): JSX.Element {
  return (
    <ComposerActions.Root id="story.new-session" priority={30}>
      <ComposerActions.Button
        visible={props.pinned === true ? 'always' : 'auto'}
        tooltip={NEW_SESSION_LABEL}
        onClick={() => props.onAction(NEW_SESSION_LABEL)}
      >
        <SquarePen class="size-5 block" aria-hidden="true" />
      </ComposerActions.Button>
      <ComposerActions.DropdownItem
        value="new"
        label={NEW_SESSION_LABEL}
        onSelect={() => props.onAction(NEW_SESSION_LABEL)}
      >
        <SquarePen class="size-4 block" aria-hidden="true" />
      </ComposerActions.DropdownItem>
    </ComposerActions.Root>
  )
}

function CompactRoot(props: {onAction: (label: string) => void; disabled?: () => boolean}): JSX.Element {
  return (
    <ComposerActions.Root id="story.compact" priority={20} disabled={props.disabled}>
      <ComposerActions.Button tooltip={COMPACT_LABEL} onClick={() => props.onAction(COMPACT_LABEL)}>
        <FoldVertical class="size-5 block" aria-hidden="true" />
      </ComposerActions.Button>
      <ComposerActions.DropdownItem
        value="compact"
        label={COMPACT_LABEL}
        onSelect={() => props.onAction(COMPACT_LABEL)}
      >
        <FoldVertical class="size-4 block" aria-hidden="true" />
      </ComposerActions.DropdownItem>
    </ComposerActions.Root>
  )
}

function CanvasRoot(props: {onAction: (label: string) => void; pinned?: boolean}): JSX.Element {
  return (
    <ComposerActions.Root id="story.canvas" priority={15}>
      <ComposerActions.Button
        visible={props.pinned === true ? 'always' : 'auto'}
        tooltip={CANVAS_LABEL}
        onClick={() => props.onAction(CANVAS_LABEL)}
      >
        <Presentation class="size-5 block" aria-hidden="true" />
      </ComposerActions.Button>
      <ComposerActions.DropdownItem value="open" label={CANVAS_LABEL} onSelect={() => props.onAction(CANVAS_LABEL)}>
        <Presentation class="size-4 block" aria-hidden="true" />
      </ComposerActions.DropdownItem>
    </ComposerActions.Root>
  )
}

function CommentRoot(props: {onAction: (label: string) => void}): JSX.Element {
  return (
    <ComposerActions.Root id="story.comment" priority={5}>
      <ComposerActions.DropdownItem
        value="comment"
        label={COMMENT_LABEL}
        onSelect={() => props.onAction(COMMENT_LABEL)}
      >
        <MessageSquarePlus class="size-4 block" aria-hidden="true" />
      </ComposerActions.DropdownItem>
    </ComposerActions.Root>
  )
}

function LaunchRoot(props: {onAction: (label: string) => void; optionsUnavailable?: boolean}): JSX.Element {
  return (
    <ComposerActions.Root id="story.launch" priority={10}>
      <ComposerActions.Inline>
        <TooltipIconButton tooltip={LAUNCH_LABEL} class="size-8.5" onClick={() => props.onAction(LAUNCH_LABEL)}>
          <SquareTerminal class="size-5 block" aria-hidden="true" />
        </TooltipIconButton>
      </ComposerActions.Inline>
      <Show
        when={props.optionsUnavailable === true}
        fallback={
          <>
            <ComposerActions.DropdownItem value="open" label={OPEN_LABEL} onSelect={() => props.onAction(OPEN_LABEL)}>
              <SquareTerminal class="size-4 block" aria-hidden="true" />
            </ComposerActions.DropdownItem>
            <ComposerActions.DropdownItem value="copy" label={COPY_LABEL} onSelect={() => props.onAction(COPY_LABEL)}>
              <ClipboardCopy class="size-4 block" aria-hidden="true" />
            </ComposerActions.DropdownItem>
          </>
        }
      >
        <ComposerActions.DropdownItem value="retry" label={RETRY_LABEL} onSelect={() => props.onAction(RETRY_LABEL)}>
          <RotateCw class="size-4 block" aria-hidden="true" />
        </ComposerActions.DropdownItem>
      </Show>
    </ComposerActions.Root>
  )
}

export const AllInline: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    return (
      <div class="flex flex-col gap-2">
        <ActionsFrame width={560}>
          <GrabRoot onAction={setLast} busy />
          <NewSessionRoot onAction={setLast} />
          <CompactRoot onAction={setLast} />
          <CanvasRoot onAction={setLast} />
          <LaunchRoot onAction={setLast} />
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
          <GrabRoot onAction={setLast} />
          <NewSessionRoot onAction={setLast} />
          <CompactRoot onAction={setLast} />
          <CanvasRoot onAction={setLast} />
          <LaunchRoot onAction={setLast} />
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

export const PinnedOnly: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    return (
      <div class="flex flex-col gap-2">
        <ActionsFrame width={210}>
          <GrabRoot onAction={setLast} />
          <CanvasRoot onAction={setLast} pinned />
          <NewSessionRoot onAction={setLast} />
          <CompactRoot onAction={setLast} />
        </ActionsFrame>
        <ActionLog value={last()} />
      </div>
    )
  },
}

export const MenuOnlyRoot: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    return (
      <div class="flex flex-col gap-2">
        <ActionsFrame width={560}>
          <GrabRoot onAction={setLast} />
          <NewSessionRoot onAction={setLast} />
          <CompactRoot onAction={setLast} />
          <CommentRoot onAction={setLast} />
        </ActionsFrame>
        <ActionLog value={last()} />
      </div>
    )
  },
}

export const MultiItemRoot: Story = {
  render: () => {
    const [last, setLast] = createSignal('')
    const [unavailable, setUnavailable] = createSignal(false)
    return (
      <div class="flex flex-col gap-2">
        <ActionsFrame width={170}>
          <NewSessionRoot onAction={setLast} />
          <CompactRoot onAction={setLast} />
          <LaunchRoot onAction={setLast} optionsUnavailable={unavailable()} />
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

export const DisabledRoot: Story = {
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
          <GrabRoot onAction={record} disabled={disabled} />
          <NewSessionRoot onAction={record} />
          <CompactRoot onAction={record} disabled={disabled} />
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
        <p class="text-[0.75rem] text-pw-text-2">Drag the bottom-right corner to watch actions collapse and expand.</p>
        <ActionsFrame width={420} resizable>
          <GrabRoot onAction={setLast} />
          <NewSessionRoot onAction={setLast} />
          <CompactRoot onAction={setLast} />
          <CanvasRoot onAction={setLast} />
          <LaunchRoot onAction={setLast} />
        </ActionsFrame>
        <ActionLog value={last()} />
      </div>
    )
  },
}
