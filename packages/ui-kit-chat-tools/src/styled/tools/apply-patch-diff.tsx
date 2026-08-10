import {type JSX} from 'solid-js'
import {FileDiff} from 'lucide-solid'
import {type FileDiffOptions} from '@conciv/solid-diffs'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {ApplyPatch, useApplyPatch, type ApplyPatchInfo} from '../../primitives/tools/apply-patch.js'
import {diffBlockClass, ToolCard} from '@conciv/ui-kit-chat/tools'
const DIFF_OPTIONS: FileDiffOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  diffStyle: 'unified',
  overflow: 'wrap',
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
      <ApplyPatch.Diffs class={diffBlockClass('sm')} options={DIFF_OPTIONS} />
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
      defaultOpen={patch.status() === 'approval'}
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
