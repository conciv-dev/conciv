import {Badge} from '@/components/ui/badge'
import {Demo} from './demo/demo'
import {InstallChip} from './install-chip'

export function Hero() {
  return (
    <header className="mx-auto grid max-w-[1180px] items-center gap-14 px-8 pb-12 pt-3 md:grid-cols-[1fr_1.02fr] md:pt-10">
      <div>
        <Badge
          variant="outline"
          className="mb-4 gap-2 border-primary/30 font-mono text-[11.5px] uppercase tracking-[0.12em] text-primary"
        >
          <span className="size-1.5 rounded-full bg-primary" /> Beta · Dev-only · Open source
        </Badge>
        <p className="mb-3 font-mono text-[13px] font-semibold uppercase tracking-[0.3em] text-primary">Conceive it.</p>
        <h1 className="od-display mb-5 text-[clamp(40px,5.2vw,62px)] font-bold leading-[1.02] tracking-[-0.03em]">
          An AI dev agent that lives inside your <span className="od-underline">running app</span>.
        </h1>
        <p className="mb-8 max-w-[30ch] text-[18px] text-muted-foreground">
          Add one plugin. Then <b className="font-semibold text-foreground">chat</b>, let it{' '}
          <b className="font-semibold text-foreground">drive the page</b>, and{' '}
          <b className="font-semibold text-foreground">run your tests</b> — without ever leaving the thing you're
          building.
        </p>
        <InstallChip />
      </div>
      <Demo />
    </header>
  )
}
