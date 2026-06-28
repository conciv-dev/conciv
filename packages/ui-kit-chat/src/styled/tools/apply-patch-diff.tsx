import {Show, type JSX} from 'solid-js'
import {FileDiff} from 'lucide-solid'
import {type FileDiffOptions} from '@mandarax/solid-diffs'
import type {ToolCardProps} from '@mandarax/protocol/tool-view-types'
import {ApplyPatch, useApplyPatch} from '../../primitives/tools/apply-patch.js'
import {CollapsibleCard} from '../collapsible-card.js'

// Styled apply_patch card: a thin --chat-* wrapper over the headless ApplyPatch primitive (which owns
// the v2-envelope parsing + status). Pierre themeType:'system' follows the chat theme.
const DIFF_OPTIONS: FileDiffOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  diffStyle: 'unified',
  overflow: 'wrap',
}
const DIFF_CLASS =
  'text-[length:var(--chat-text-xs)] rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] max-h-80 max-w-full block overflow-auto'

function Header(): JSX.Element {
  const patch = useApplyPatch()
  return (
    <>
      <FileDiff size={14} class="text-[color:var(--chat-text-3)] shrink-0" aria-hidden="true" />
      <span class="text-[color:var(--chat-text)] [font-family:var(--chat-mono)]">{patch.name()}</span>
      <Show when={patch.fileLabel()}>
        <span class="text-[color:var(--chat-text-3)] truncate">{patch.fileLabel()}</span>
      </Show>
      <span class="text-[length:var(--chat-text-xs)] ml-auto flex gap-1.5 [font-family:var(--chat-mono)] items-center">
        <Show when={patch.info().added > 0}>
          <span class="text-[color:var(--chat-success)]">+{patch.info().added}</span>
        </Show>
        <Show when={patch.info().removed > 0}>
          <span class="text-[color:var(--chat-danger)]">−{patch.info().removed}</span>
        </Show>
      </span>
    </>
  )
}

function Body(): JSX.Element {
  const patch = useApplyPatch()
  return (
    <CollapsibleCard defaultOpen={patch.status() === 'approval'} header={<Header />}>
      <div class="flex flex-col gap-1.5">
        <ApplyPatch.Diffs class={DIFF_CLASS} options={DIFF_OPTIONS} />
      </div>
    </CollapsibleCard>
  )
}

export function ApplyPatchDiff(props: ToolCardProps): JSX.Element {
  return (
    <ApplyPatch.Root part={props.part} result={props.result}>
      <Body />
    </ApplyPatch.Root>
  )
}
