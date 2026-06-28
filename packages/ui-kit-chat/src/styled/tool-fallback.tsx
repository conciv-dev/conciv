import {Show, type JSX} from 'solid-js'
import {SolidCodeBlock, type FileOptions} from '@mandarax/solid-diffs'
import type {ToolCardProps} from '@mandarax/protocol/tool-view-types'
import {ToolFallback as ToolFallbackPrimitive, useToolFallback} from '../primitives/tools/tool-fallback.js'
import type {ToolStatus} from '../primitives/tools/tool-status.js'
import {CollapsibleCard} from './collapsible-card.js'

const DOT: Record<ToolStatus, string> = {
  running: '[background:var(--chat-accent)] anim-pulse motion-reduce:[animation:none]',
  complete: '[background:var(--chat-success)]',
  error: '[background:var(--chat-danger)]',
  approval: '[background:var(--chat-accent)]',
}

const LABEL: Record<ToolStatus, string> = {
  running: 'Running',
  complete: 'Done',
  error: 'Failed',
  approval: 'Needs approval',
}

// Render args/results through our shared @pierre/diffs code block (shiki-highlighted). Dual theme +
// themeType:'system' so Pierre resolves the color via CSS color-scheme (set per chat theme in
// tokens.css). Capped height so a huge payload can't blow the thread.
const CODE_OPTIONS: FileOptions<undefined> = {theme: {light: 'github-light', dark: 'github-dark'}, themeType: 'system'}
const CODE_CLASS =
  'text-[length:var(--chat-text-xs)] rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] max-h-80 max-w-full block overflow-auto'

function Body(): JSX.Element {
  const tool = useToolFallback()
  return (
    <CollapsibleCard
      defaultOpen={tool.status() === 'approval'}
      header={
        <>
          <span class={`rounded-[var(--chat-radius-pill)] shrink-0 size-2 ${DOT[tool.status()]}`} aria-hidden="true" />
          <span class="text-[color:var(--chat-text)] [font-family:var(--chat-mono)]">{tool.name()}</span>
          <span class="text-[color:var(--chat-text-3)] ml-auto">{LABEL[tool.status()]}</span>
        </>
      }
    >
      <div class="flex flex-col gap-1.5">
        <SolidCodeBlock
          class={CODE_CLASS}
          options={CODE_OPTIONS}
          file={{name: 'arguments.json', contents: tool.argsText()}}
        />
        <Show when={tool.resultText()}>
          <SolidCodeBlock
            class={CODE_CLASS}
            options={CODE_OPTIONS}
            file={{name: tool.resultName(), contents: tool.resultText()}}
          />
        </Show>
      </div>
    </CollapsibleCard>
  )
}

// The generic tool card: collapsed by default (D2), auto-expands on approval. Full-width inside the
// assistant turn (min-w-0 via CollapsibleCard) so expanding grows height, not turn edges (D1). A thin
// --chat-* wrapper over the headless ToolFallback primitive.
export function ToolFallback(props: ToolCardProps): JSX.Element {
  return (
    <ToolFallbackPrimitive.Root part={props.part} result={props.result}>
      <Body />
    </ToolFallbackPrimitive.Root>
  )
}
