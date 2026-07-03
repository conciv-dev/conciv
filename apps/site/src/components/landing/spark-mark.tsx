import {m} from 'motion/react'
import {Sparkle} from 'lucide-react'
import {cn} from '@/lib/utils'

export function SparkMark({className}: {className?: string}) {
  return (
    <m.span
      className={cn('inline-flex align-[-0.08em]', className)}
      whileHover={{rotate: 180, scale: 1.2}}
      whileTap={{rotate: 180, scale: 1.2}}
      transition={{type: 'spring', stiffness: 340, damping: 14}}
    >
      <Sparkle aria-hidden className="size-[0.85em] translate-y-[0.04em] fill-current" />
    </m.span>
  )
}
