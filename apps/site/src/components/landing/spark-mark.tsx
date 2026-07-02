import {Sparkle} from 'lucide-react'
import {cn} from '@/lib/utils'

export function SparkMark({className}: {className?: string}) {
  return <Sparkle aria-hidden className={cn('inline-block size-[0.85em] fill-current align-[-0.08em]', className)} />
}
