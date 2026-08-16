import {Sparkle} from 'lucide-react'
import {cn} from '@/lib/utils'

export function SparkMark({className}: {className?: string}) {
  return (
    <span
      className={cn(
        'inline-flex transition-transform duration-200 ease-[var(--od-ease-out)] group-hover:rotate-[4deg] group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:rotate-0 motion-reduce:group-hover:scale-100',
        className,
      )}
    >
      <Sparkle aria-hidden className="size-[0.75em] translate-y-[0.09em] fill-current" />
    </span>
  )
}
