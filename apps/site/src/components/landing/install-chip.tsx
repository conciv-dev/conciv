import {Badge} from '@/components/ui/badge'

export function InstallChip() {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-lg border bg-secondary px-3.5 py-2.5 font-mono text-[13px] text-muted-foreground">
      <span className="text-primary">$</span>
      <span className="line-through opacity-55">npm i -D opendui</span>
      <Badge className="bg-accent font-sans text-[11px] uppercase tracking-wide text-accent-foreground">
        Coming soon
      </Badge>
    </div>
  )
}
