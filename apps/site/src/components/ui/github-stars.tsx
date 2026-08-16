import {Star} from 'lucide-react'
import {useReducedMotion, useSpring} from 'motion/react'
import {useEffect, useState} from 'react'
import {cn} from '@/lib/utils'

const COUNT_SPRING = {damping: 30, stiffness: 100}
const BUMP_DELAY_MS = 100

function useAnimatedCount(starCount: number | null, hovered: boolean, shouldReduceMotion: boolean | null): number {
  const countSpring = useSpring(0, COUNT_SPRING)
  const [displayCount, setDisplayCount] = useState(0)

  useEffect(() => countSpring.on('change', (value) => setDisplayCount(Math.round(value))), [countSpring])

  useEffect(() => {
    if (starCount === null) return
    if (shouldReduceMotion) {
      setDisplayCount(starCount)
      countSpring.jump(starCount)
      return
    }
    countSpring.set(starCount)
  }, [countSpring, shouldReduceMotion, starCount])

  useEffect(() => {
    if (starCount === null || shouldReduceMotion) return
    if (!hovered) {
      countSpring.jump(starCount)
      return
    }
    const timer = setTimeout(() => countSpring.set(starCount + 1), BUMP_DELAY_MS)
    return () => clearTimeout(timer)
  }, [countSpring, hovered, shouldReduceMotion, starCount])

  return displayCount
}

const STAR_MOTION =
  'transition-transform duration-150 ease-[var(--od-ease-out)] group-hover:-rotate-12 group-hover:scale-110 group-hover:duration-[280ms] group-focus-visible:-rotate-12 group-focus-visible:scale-110 group-focus-visible:duration-[280ms] motion-reduce:transition-none motion-reduce:group-hover:rotate-0 motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:rotate-0 motion-reduce:group-focus-visible:scale-100'

const FILL_MOTION =
  'absolute inset-0 inline-flex text-[var(--od-star)] [clip-path:inset(100%_0_0_0)] transition-[clip-path] duration-150 ease-[var(--od-ease-out)] group-hover:[clip-path:inset(0_0_0_0)] group-hover:duration-[280ms] group-focus-visible:[clip-path:inset(0_0_0_0)] group-focus-visible:duration-[280ms] motion-reduce:transition-none'

function StarIcon() {
  return (
    <span aria-hidden className={cn('relative inline-flex', STAR_MOTION)}>
      <Star className="size-4" />
      <span className={FILL_MOTION}>
        <Star className="size-4 fill-current" />
      </span>
    </span>
  )
}

const PLUS_ONE_MOTION =
  'pointer-events-none absolute -top-3 right-0 text-[var(--od-star)] opacity-0 translate-y-1 transition-[opacity,transform] duration-150 ease-[var(--od-ease-out)] group-hover:-translate-y-2 group-hover:opacity-100 group-hover:delay-100 group-hover:duration-500 group-focus-visible:-translate-y-2 group-focus-visible:opacity-100 group-focus-visible:delay-100 group-focus-visible:duration-500 motion-reduce:hidden'

function StarCount({
  starCount,
  displayCount,
  formatCount,
  className,
}: {
  starCount: number | null
  displayCount: number
  formatCount: (count: number) => string
  className?: string
}) {
  return (
    <span className={cn('relative inline-flex min-w-[2.5ch] justify-end tabular-nums', className)}>
      <span aria-hidden>{starCount === null ? '' : formatCount(displayCount)}</span>
      {starCount !== null && <span className="sr-only">{starCount} stars on GitHub</span>}
      <span aria-hidden className={PLUS_ONE_MOTION}>
        +1
      </span>
    </span>
  )
}

export function GitHubStars({
  starCount,
  formatCount,
  hovered = false,
  className,
  countClassName,
}: {
  starCount: number | null
  formatCount: (count: number) => string
  hovered?: boolean
  className?: string
  countClassName?: string
}) {
  const shouldReduceMotion = useReducedMotion()
  const displayCount = useAnimatedCount(starCount, hovered, shouldReduceMotion)

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <StarIcon />
      <StarCount
        starCount={starCount}
        displayCount={displayCount}
        formatCount={formatCount}
        className={countClassName}
      />
    </span>
  )
}
