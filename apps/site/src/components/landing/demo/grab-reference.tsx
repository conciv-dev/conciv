import type {Pickable} from './demo-data'

// The grabbed-element reference chip shown above the composer input.
// Renders the grabbed element as a live preview, then its source location.
export function GrabReference({pickable}: {pickable: Pickable}) {
  return (
    <div className="mb-2.5 flex flex-col items-start gap-2.5 rounded-lg border border-l-[3px] border-l-primary bg-secondary p-3.5 font-mono text-[11px]">
      <span
        className="od-grab-render inline-flex rounded-lg p-1"
        style={{background: 'color-mix(in oklch, var(--od-accent) 6%, transparent)'}}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{__html: previewHtml(pickable)}}
      />
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="text-primary">↳</span> in {pickable.where}
      </span>
    </div>
  )
}

// The grabbed element rendered for preview; the sample app uses the `.cta` class for its button.
function previewHtml(pickable: Pickable): string {
  return pickable.html
}
