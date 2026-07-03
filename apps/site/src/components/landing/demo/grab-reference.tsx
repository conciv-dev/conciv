import {X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import type {Pickable} from './demo-data'

export function GrabReference({pickable, onUngrab}: {pickable: Pickable; onUngrab: () => void}) {
  return (
    <div className="relative mb-2.5 flex flex-col items-start gap-2.5 rounded-lg border border-l-[3px] border-l-primary bg-secondary p-3.5 font-mono text-[11px]">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onUngrab}
        aria-label="Clear grabbed element"
        className="absolute right-1.5 top-1.5 size-6 text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </Button>
      <span
        className="od-grab-render inline-flex rounded-lg p-1"
        style={{background: 'color-mix(in oklch, var(--od-accent) 6%, transparent)'}}
        dangerouslySetInnerHTML={{__html: pickable.html}}
      />
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="text-primary">↳</span> in {pickable.where}
      </span>
    </div>
  )
}
