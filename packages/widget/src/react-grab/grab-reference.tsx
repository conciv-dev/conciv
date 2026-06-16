import {Show, type JSX} from 'solid-js'
import {X} from 'lucide-solid'
import type {ElementSnapshot, ElementSource, StagedGrab} from './grab-types.js'

// Scale a captured snapshot down to fit a width, never up past 1:1.
function fitScale(width: number, maxWidth: number): number {
  if (width <= 0) return 1
  return Math.min(1, maxWidth / width)
}

// Pure: mount a snapshot in an isolated stage, scaled to fit `maxWidth`. No chrome — reused as-is
// by the composer chip today and (phase-2) inside a sent message bubble. The outer box is sized to
// the SCALED dims so it reserves only the visible footprint; the inner layer carries the transform.
function ScaledSnapshot(props: {snapshot: ElementSnapshot; maxWidth: number}): JSX.Element {
  const scale = () => fitScale(props.snapshot.width, props.maxWidth)
  return (
    <div
      class="pw-grab-ref-stage"
      style={{
        width: `${Math.ceil(props.snapshot.width * scale())}px`,
        height: `${Math.ceil(props.snapshot.height * scale())}px`,
      }}
    >
      <div
        class="pw-grab-ref-scale"
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

// The staged-grab chip above the composer: an accent-railed card with the live scaled element, its
// source location, and a remove control. Mirrors the marketing demo's GrabReference, real content.
export function GrabReference(props: {grab: StagedGrab; maxWidth: number; onRemove: () => void}): JSX.Element {
  return (
    <div class="pw-grab-ref">
      <button
        type="button"
        class="pw-grab-ref-remove"
        aria-label="Remove grabbed element"
        onClick={() => props.onRemove()}
      >
        <X class="pw-icon" aria-hidden="true" />
      </button>
      <ScaledSnapshot snapshot={props.grab.snapshot} maxWidth={props.maxWidth} />
      <Show when={props.grab.source}>
        {(source) => (
          <span class="pw-grab-ref-src">
            <span class="pw-grab-ref-arrow" aria-hidden="true">
              ↳
            </span>{' '}
            in {sourceLabel(source())}
          </span>
        )}
      </Show>
    </div>
  )
}
