import {Badge} from '@/components/ui/badge'
import {cn} from '@/lib/utils'

export function AppPreview({picking, onPick}: {picking: boolean; onPick: (id: string) => void}) {
  return (
    <div className={cn('od-preview relative flex flex-col p-[18px]', picking && 'od-picking')}>
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">your live app</div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <Pickable id="heading" picking={picking} onPick={onPick}>
          <span className="od-display block text-xl">Welcome back</span>
        </Pickable>
        <Pickable id="sub" picking={picking} onPick={onPick}>
          <span className="block text-[12.5px] text-muted-foreground">Sign in to continue</span>
        </Pickable>
        <Pickable id="cta" picking={picking} onPick={onPick}>
          <button type="button" className="od-cta" tabIndex={-1}>
            Get started
          </button>
        </Pickable>
      </div>

      {picking ? (
        <div className="pointer-events-none absolute inset-x-0 top-3.5 flex justify-center">
          <Badge className="bg-primary text-primary-foreground shadow-lg">Picking… click an element</Badge>
        </div>
      ) : null}
    </div>
  )
}

function Pickable({
  id,
  picking,
  onPick,
  children,
}: {
  id: string
  picking: boolean
  onPick: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <span
      data-pickable={id}
      onClick={picking ? () => onPick(id) : undefined}
      className={cn(
        'od-pickable inline-flex rounded-lg outline-2 outline-offset-[3px] outline-transparent transition-[outline-color,box-shadow]',
        picking && 'od-pickable-active cursor-crosshair',
      )}
    >
      {children}
    </span>
  )
}
