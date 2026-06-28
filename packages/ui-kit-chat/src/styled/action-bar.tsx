import {type JSX} from 'solid-js'
import {Check, Copy, Download, MoreHorizontal, Pencil, RefreshCw} from 'lucide-solid'
import {Swap} from '@mandarax/ui-kit-system'
import {ActionBar, useCopied, useExportMarkdown} from '../primitives/action-bar/action-bar.js'
import {ActionBarMore} from '../primitives/action-bar-more/action-bar-more.js'
import {TooltipIconButton} from './tooltip-icon-button.js'
import {FOCUS, HIGHLIGHT} from './classes.js'

// Styled message action bar — assistant-ui's AssistantActionBar/UserActionBar, ported to the headless
// primitives. Each action merges with TooltipIconButton through the `render` slot (asChild), so the
// real Tooltip wraps the headless button (no native title=, D4). Copy crossfades to a check via Ark Swap.
// lucide `size` is in PIXELS (default 24).
const ICON = 16

const TRIGGER = `inline-flex items-center justify-center size-9 rounded-[var(--chat-radius-md)] [background:transparent] [color:var(--chat-text-2)] cursor-pointer [transition:background_140ms_var(--chat-ease),color_140ms_var(--chat-ease)] hover:[color:var(--chat-text-hi)] hover:[background:var(--chat-fill-strong)] data-[state=open]:[background:var(--chat-fill-strong)] ${FOCUS}`
const MENU =
  'min-w-32 p-1.5 rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-panel)] shadow-[var(--chat-shadow-lg)] anim-presence-in'
const ITEM = `flex items-center gap-2 px-2.5 py-1.5 text-[length:var(--chat-text-sm)] rounded-[var(--chat-radius-sm)] cursor-pointer select-none [color:var(--chat-text-2)] hover:[background:var(--chat-fill-strong)] hover:[color:var(--chat-text-hi)] [outline:none] ${HIGHLIGHT}`

// The export item lives in the overflow Menu: a real Menu.Item (keyboard nav) whose onSelect runs the
// shared export behavior — no nested buttons, no element-typed handler bridging.
function ExportMarkdownItem(): JSX.Element {
  const exportMarkdown = useExportMarkdown()
  return (
    <ActionBarMore.Item value="export-markdown" onSelect={exportMarkdown} class={ITEM}>
      <Download size={14} />
      Export as Markdown
    </ActionBarMore.Item>
  )
}

// Copy↔Check crossfade reads the headless Copy's copied flag (provided via context) and drives Ark Swap.
function CopySwap(): JSX.Element {
  const copied = useCopied()
  return (
    <Swap.Root swap={copied()}>
      <Swap.Indicator type="on">
        <Check size={ICON} />
      </Swap.Indicator>
      <Swap.Indicator type="off">
        <Copy size={ICON} />
      </Swap.Indicator>
    </Swap.Root>
  )
}

export function AssistantActionBar(): JSX.Element {
  return (
    <ActionBar.Root hideWhenRunning autohide="not-last" class="flex gap-0.5 anim-presence-in">
      <ActionBar.Copy
        render={(props) => (
          <TooltipIconButton {...props} tooltip="Copy" class="size-9">
            <CopySwap />
          </TooltipIconButton>
        )}
      />
      <ActionBar.Reload
        render={(props) => (
          <TooltipIconButton {...props} tooltip="Refresh" class="size-9">
            <RefreshCw size={ICON} />
          </TooltipIconButton>
        )}
      />
      <ActionBarMore.Root>
        <ActionBarMore.Trigger class={TRIGGER} aria-label="More">
          <MoreHorizontal size={ICON} />
        </ActionBarMore.Trigger>
        <ActionBarMore.Content class={MENU}>
          <ExportMarkdownItem />
        </ActionBarMore.Content>
      </ActionBarMore.Root>
    </ActionBar.Root>
  )
}

export function UserActionBar(): JSX.Element {
  return (
    <ActionBar.Root hideWhenRunning autohide="not-last" class="flex flex-col items-end anim-presence-in">
      <ActionBar.Edit
        render={(props) => (
          <TooltipIconButton {...props} tooltip="Edit" class="size-9">
            <Pencil size={ICON} />
          </TooltipIconButton>
        )}
      />
    </ActionBar.Root>
  )
}
