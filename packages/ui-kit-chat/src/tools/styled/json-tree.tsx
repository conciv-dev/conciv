import type {JSX} from 'solid-js'
import {ChevronRight} from 'lucide-solid'
import {JsonTreeView} from '@conciv/ui-kit-system'

const JSON_TREE_ROOT =
  '[font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] max-h-[13.75rem] w-full rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] overflow-auto p-1.5'

export function JsonTree(props: {data: unknown}): JSX.Element {
  return (
    <JsonTreeView.Root
      data={props.data}
      defaultExpandedDepth={1}
      collapseStringsAfterLength={60}
      maxPreviewItems={5}
      groupArraysAfterLength={20}
      class={JSON_TREE_ROOT}
    >
      <JsonTreeView.Tree class="json-tree" arrow={<ChevronRight size={12} aria-hidden="true" />} />
    </JsonTreeView.Root>
  )
}
