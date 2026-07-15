import {Show, type JSX} from 'solid-js'
import {X} from 'lucide-solid'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import type {ElementSnapshot, ElementSource, Grab} from '@conciv/grab'

function fitScale(width: number, maxWidth: number): number {
  if (width <= 0) return 1
  return Math.min(1, maxWidth / width)
}

function ScaledSnapshot(props: {snapshot: ElementSnapshot; maxWidth: number}): JSX.Element {
  const scale = () => fitScale(props.snapshot.width, props.maxWidth)
  return (
    <div
      class="inline-flex max-w-full cursor-default overflow-hidden"
      style={{
        width: `${Math.ceil(props.snapshot.width * scale())}px`,
        height: `${Math.ceil(props.snapshot.height * scale())}px`,
      }}
    >
      <div
        class="flex-none pointer-events-none origin-top-left"
        data-pw-grab-scale
        style={{
          width: `${props.snapshot.width}px`,
          height: `${props.snapshot.height}px`,
          transform: `scale(${scale()})`,
        }}
        ref={(el) => el.appendChild(props.snapshot.node.cloneNode(true))}
      />
    </div>
  )
}

function sourceLabel(source: ElementSource): string {
  const where = source.lineNumber === null ? source.filePath : `${source.filePath}:${source.lineNumber}`
  return source.componentName ? `${source.componentName} at ${where}` : where
}

function stagedGrab(grab: Grab | {text: string}): Grab | null {
  return 'snapshot' in grab ? grab : null
}

export function GrabReference(props: {
  grab: Grab | {text: string}
  maxWidth: number
  onRemove: () => void
}): JSX.Element {
  return (
    <div
      class="text-[0.6875rem] font-pw-mono mb-2 p-3 border-b border-r border-t border-y-pw-line border-l-[0.1875rem] border-l-pw-accent border-r-pw-line rounded-pw-md bg-pw-fill flex flex-col gap-2.5 items-start relative anim-presence-in"
      data-pw-grab
    >
      <TooltipIconButton
        class="text-pw-text-2 rounded-pw-pill bg-transparent inline-flex size-6 cursor-pointer [border:none] trans-color-bg items-center right-1.5 top-1.5 justify-center absolute hover:text-pw-text-hi hover:bg-pw-line"
        tooltip="Remove grabbed element"
        onClick={() => props.onRemove()}
      >
        <X class="size-5 block" aria-hidden="true" />
      </TooltipIconButton>
      <Show
        when={stagedGrab(props.grab)}
        fallback={<span class="text-pw-text-2 [word-break:break-all]">{props.grab.text}</span>}
      >
        {(grab) => (
          <>
            <ScaledSnapshot snapshot={grab().snapshot} maxWidth={props.maxWidth} />
            <Show when={grab().source}>
              {(source) => (
                <span class="text-pw-text-2 flex gap-1.5 [word-break:break-all] items-center">
                  <span class="text-pw-accent" aria-hidden="true">
                    ↳
                  </span>{' '}
                  in {sourceLabel(source())}
                </span>
              )}
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}
