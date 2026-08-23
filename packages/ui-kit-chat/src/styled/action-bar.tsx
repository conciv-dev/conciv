import {Show, type JSX} from 'solid-js'
import Check from 'lucide-solid/icons/check'
import Copy from 'lucide-solid/icons/copy'
import Download from 'lucide-solid/icons/download'
import MoreHorizontal from 'lucide-solid/icons/ellipsis'
import Pencil from 'lucide-solid/icons/pencil'
import RefreshCw from 'lucide-solid/icons/refresh-cw'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import {Swap, TooltipIconButton, TooltipIconButtonSlot, type ClipboardCopyStatus} from '@conciv/ui-kit-system'
import {ActionBar, useCopyStatus, useExportMarkdown} from '../primitives/action-bar/action-bar.js'
import {ActionBarMore} from '../primitives/action-bar-more/action-bar-more.js'
import {FOCUS, HIGHLIGHT} from './classes.js'

const ICON = 14
const MORE_LABEL = 'More message actions'

const TRIGGER = `inline-flex items-center justify-center size-6 rounded-[var(--chat-radius-sm)] [background:transparent] [color:var(--chat-text-2)] cursor-pointer [transition:background_140ms_var(--chat-ease),color_140ms_var(--chat-ease)] hover:[color:var(--chat-text-hi)] hover:[background:var(--chat-fill-strong)] data-[state=open]:[background:var(--chat-fill-strong)] ${FOCUS}`
const MENU =
  'min-w-32 p-1.5 rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-panel)] shadow-[var(--chat-shadow-lg)] anim-presence-in'
const ITEM = `flex items-center gap-2 px-2.5 py-1.5 text-[length:var(--chat-text-sm)] rounded-[var(--chat-radius-sm)] cursor-pointer select-none [color:var(--chat-text-2)] hover:[background:var(--chat-fill-strong)] hover:[color:var(--chat-text-hi)] [outline:none] ${HIGHLIGHT}`

function ExportMarkdownItem(): JSX.Element {
  const exportMarkdown = useExportMarkdown()
  return (
    <ActionBarMore.Item value="export-markdown" onSelect={exportMarkdown} class={ITEM}>
      <Download size={14} />
      Export as Markdown
    </ActionBarMore.Item>
  )
}

const COPY_TOOLTIP: Record<ClipboardCopyStatus, string> = {idle: 'Copy', copied: 'Copied', failed: 'Copy failed'}
const COPY_MESSAGE: Record<ClipboardCopyStatus, string> = {
  idle: '',
  copied: 'Copied the message',
  failed: 'Could not copy the message',
}

function CopySwap(): JSX.Element {
  const status = useCopyStatus()
  return (
    <Swap.Root swap={status() !== 'idle'}>
      <Swap.Indicator type="on">
        <Show when={status() === 'failed'} fallback={<Check size={ICON} />}>
          <TriangleAlert size={ICON} class="text-chat-danger" />
        </Show>
      </Swap.Indicator>
      <Swap.Indicator type="off">
        <Copy size={ICON} />
      </Swap.Indicator>
    </Swap.Root>
  )
}

function CopyButton(props: {buttonProps: JSX.ButtonHTMLAttributes<HTMLButtonElement>}): JSX.Element {
  const status = useCopyStatus()
  return (
    <>
      <TooltipIconButton {...props.buttonProps} tooltip={COPY_TOOLTIP[status()]} class="size-6">
        <CopySwap />
      </TooltipIconButton>
      <span role="status" aria-live="polite" class="sr-only">
        {COPY_MESSAGE[status()]}
      </span>
    </>
  )
}

const AUTOHIDE_VISIBILITY =
  '[transition:opacity_110ms_var(--chat-ease)] motion-reduce:[transition:none] data-[autohide=true]:opacity-0 data-[autohide=true]:pointer-events-none data-[autohide=true]:data-[active=true]:opacity-100 data-[autohide=true]:data-[active=true]:pointer-events-auto data-[autohide=true]:focus-within:opacity-100 data-[autohide=true]:focus-within:pointer-events-auto'

const ASSISTANT_BAR_CLASS = `flex gap-0.5 pointer-events-auto ${AUTOHIDE_VISIBILITY}`

export function AssistantActionBar(): JSX.Element {
  return (
    <ActionBar.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="always"
      role="toolbar"
      aria-label="Message actions"
      class={ASSISTANT_BAR_CLASS}
    >
      <ActionBar.Copy render={(props) => <CopyButton buttonProps={props} />} />
      <ActionBar.Reload
        render={(props) => (
          <TooltipIconButton {...props} tooltip="Refresh" class="size-6">
            <RefreshCw size={ICON} />
          </TooltipIconButton>
        )}
      />
      <ActionBarMore.Root>
        <TooltipIconButtonSlot tooltip={MORE_LABEL}>
          {(buttonProps) => (
            <ActionBarMore.Trigger
              asChild={(triggerProps) => (
                <button {...buttonProps()} {...triggerProps()} class={TRIGGER}>
                  <MoreHorizontal size={ICON} />
                </button>
              )}
            />
          )}
        </TooltipIconButtonSlot>
        <ActionBarMore.Content class={MENU}>
          <ExportMarkdownItem />
        </ActionBarMore.Content>
      </ActionBarMore.Root>
    </ActionBar.Root>
  )
}

export function UserActionBar(): JSX.Element {
  return (
    <ActionBar.Root
      hideWhenRunning
      autohide="not-last"
      autohideFloat="always"
      role="toolbar"
      aria-label="Message actions"
      class={`flex flex-col pointer-events-auto items-end data-[floating=true]:bottom-0 data-[floating=true]:right-0 data-[floating=true]:absolute ${AUTOHIDE_VISIBILITY}`}
    >
      <ActionBar.Edit
        render={(props) => (
          <TooltipIconButton {...props} tooltip="Edit" class="size-6">
            <Pencil size={ICON} />
          </TooltipIconButton>
        )}
      />
    </ActionBar.Root>
  )
}
