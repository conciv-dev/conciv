import {SparkMark} from './landing/spark-mark'
import {cn} from '@/lib/utils'

export function BrandMark({className}: {className?: string}) {
  return (
    <span className={cn('group inline-flex items-center gap-1.5 text-base font-bold tracking-[-0.02em]', className)}>
      <SparkMark className="text-primary" />
      <span className="leading-none">conciv</span>
    </span>
  )
}
