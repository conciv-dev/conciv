import {Show, type JSX} from 'solid-js'
import X from 'lucide-solid/icons/x'
import {TooltipIconButton} from '@conciv/ui-kit-system'
import type {GrabPreview, Grab} from '@conciv/grab'
import {sourceLabel} from './grab-source-label.js'

function ScaledSnapshot(props: {preview: GrabPreview}): JSX.Element {
  return (
    <div class="w-full [container-type:inline-size] cursor-default">
      <div
        class="pointer-events-none"
        data-pw-grab-scale
        style={{
          width: `${props.preview.width}px`,
          zoom: `min(1, calc(100cqw / ${props.preview.width}px))`,
        }}
        ref={(el) => {
          const preview = props.preview
          if (preview.kind === 'dom') {
            el.appendChild(preview.node.cloneNode(true))
            return
          }
          const img = document.createElement('img')
          img.src = preview.dataUrl
          img.width = preview.width
          img.height = preview.height
          img.alt = ''
          el.appendChild(img)
        }}
      />
    </div>
  )
}

function stagedGrab(grab: Grab | {text: string}): Grab | null {
  return 'preview' in grab ? grab : null
}

export function GrabReference(props: {grab: Grab | {text: string}; onRemove: () => void}): JSX.Element {
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
            <ScaledSnapshot preview={grab().preview} />
            <Show when={grab().source}>
              {(source) => (
                <Show when={sourceLabel(source())}>
                  {(label) => (
                    <span class="text-pw-text-2 flex gap-1.5 [word-break:break-all] items-center">
                      <span class="text-pw-accent" aria-hidden="true">
                        ↳
                      </span>{' '}
                      in {label()}
                    </span>
                  )}
                </Show>
              )}
            </Show>
          </>
        )}
      </Show>
    </div>
  )
}
