import {For, type JSX} from 'solid-js'
import FileDiff from 'lucide-solid/icons/file-diff'
import {SolidPatchDiff, type FileDiffOptions} from '@conciv/solid-diffs'
import type {ToolCardEntry, ToolCardProps, ToolRowProjection, ToolRowProps} from '@conciv/protocol/tool-view-types'
import {
  ApplyPatch,
  claudeBlockToUnifiedDiff,
  parseClaudePatchBlocks,
  patchInfo,
  patchTextOf,
  useApplyPatch,
  type ApplyPatchBlock,
  type ApplyPatchInfo,
} from '../../primitives/tools/apply-patch.js'
import {diffBlockClass, rowMarkOf, TraceOutputBlock, ToolCard} from '@conciv/ui-kit-chat/tools'
import {codeTheme} from '@conciv/ui-kit-chat/theme/code-theme'

function diffOptions(disableFileHeader = false): FileDiffOptions<undefined> {
  return {
    theme: codeTheme(),
    themeType: 'system',
    diffStyle: 'unified',
    overflow: 'wrap',
    disableFileHeader,
  }
}

function Icon(): JSX.Element {
  return <FileDiff size={14} aria-hidden="true" />
}

function title(name: string, fileLabel: string): string {
  return fileLabel ? `${name} ${fileLabel}` : name
}

function counts(info: ApplyPatchInfo): string | undefined {
  const parts = [
    {count: info.added, label: `+${info.added}`},
    {count: info.removed, label: `−${info.removed}`},
  ]
    .filter((entry) => entry.count > 0)
    .map((entry) => entry.label)
  return parts.length > 0 ? parts.join(' ') : undefined
}

function Body(): JSX.Element {
  return (
    <div class="flex flex-col gap-1.5">
      <ApplyPatch.Diffs class={diffBlockClass('sm')} options={diffOptions()} />
    </div>
  )
}

function CardBody(props: ToolCardProps): JSX.Element {
  const patch = useApplyPatch()
  return (
    <ToolCard
      Icon={Icon}
      title={title(patch.name(), patch.fileLabel())}
      meta={counts(patch.info())}
      part={props.part}
      result={props.result}
    >
      <Body />
    </ToolCard>
  )
}

export function ApplyPatchDiff(props: ToolCardProps): JSX.Element {
  return (
    <ApplyPatch.Root part={props.part} result={props.result}>
      <CardBody {...props} />
    </ApplyPatch.Root>
  )
}

function fileLabelOf(info: ApplyPatchInfo): string {
  if (info.files.length === 1) return info.files[0] ?? ''
  if (info.files.length > 1) return `${info.files.length} files`
  return 'a patch'
}

const DIFF_DENSITY = '[--diffs-gap-block:2px] [--diffs-line-height:18px]'

function patchBlock(blocks: ApplyPatchBlock[], patchText: string): () => JSX.Element {
  return () => (
    <TraceOutputBlock label="Patch" size="tall" text={patchText}>
      <For each={blocks}>
        {(block) => (
          <SolidPatchDiff
            class={diffBlockClass('xs', DIFF_DENSITY)}
            options={diffOptions(blocks.length === 1)}
            patch={claudeBlockToUnifiedDiff(block)}
          />
        )}
      </For>
    </TraceOutputBlock>
  )
}

export function applyPatchRowProjection(source: ToolRowProps): ToolRowProjection {
  const patchText = patchTextOf(source.part)
  const info = patchInfo(patchText)
  const blocks = parseClaudePatchBlocks(patchText)
  return {
    mark: rowMarkOf(source.part, source.result),
    label: 'edit',
    target: fileLabelOf(info),
    meta: patchText.length === 0 ? undefined : `+${info.added} −${info.removed}`,
    block: blocks.length === 0 ? undefined : patchBlock(blocks, patchText),
  }
}

export const applyPatchTool: ToolCardEntry = {
  names: ['apply_patch'],
  render: ApplyPatchDiff,
  row: applyPatchRowProjection,
}
