import {Star} from 'lucide-react'
import {AnimatePresence, m, useReducedMotion, useSpring} from 'motion/react'
import {useEffect, useState} from 'react'
import {cn} from '@/lib/utils'

const SPRING = {damping: 30, stiffness: 100}
const FILL_SPRING = {type: 'spring', stiffness: 260, damping: 18} as const
const STAR_SPRING = {type: 'spring', bounce: 0.35, duration: 0.45} as const

function useAnimatedCount(target: number | null, shouldReduceMotion: boolean | null): number {
  const countSpring = useSpring(0, SPRING)
  const [displayCount, setDisplayCount] = useState(0)

  useEffect(() => countSpring.on('change', (value) => setDisplayCount(Math.round(value))), [countSpring])

  useEffect(() => {
    if (target === null) return
    if (shouldReduceMotion) {
      setDisplayCount(target)
      countSpring.jump(target)
      return
    }
    countSpring.set(target)
  }, [countSpring, shouldReduceMotion, target])

  return displayCount
}

const springOr = <T,>(shouldReduceMotion: boolean | null, spring: T) => (shouldReduceMotion ? {duration: 0} : spring)

function bumpedCount(starCount: number | null, hovered: boolean): number | null {
  if (starCount === null) return null
  return hovered ? starCount + 1 : starCount
}

function StarIcon({hovered, shouldReduceMotion}: {hovered: boolean; shouldReduceMotion: boolean | null}) {
  const filled = hovered ? 'inset(0% 0 0 0)' : 'inset(100% 0 0 0)'
  return (
    <m.span
      aria-hidden
      className="relative inline-flex"
      animate={{scale: hovered ? 1.08 : 1}}
      transition={springOr(shouldReduceMotion, STAR_SPRING)}
    >
      <Star className="size-4" />
      <m.span
        className="absolute inset-0 inline-flex text-[oklch(0.8_0.16_85)]"
        initial={false}
        animate={{clipPath: filled}}
        transition={springOr(shouldReduceMotion, FILL_SPRING)}
      >
        <Star className="size-4 fill-current" />
      </m.span>
    </m.span>
  )
}

function PlusOne({visible}: {visible: boolean}) {
  return (
    <AnimatePresence>
      {visible && (
        <m.span
          aria-hidden
          className="absolute -top-3 right-0 text-[oklch(0.72_0.16_85)]"
          initial={{opacity: 0, y: 4}}
          animate={{opacity: 1, y: -6}}
          exit={{opacity: 0, y: -12}}
          transition={{duration: 0.35, ease: 'easeOut'}}
        >
          +1
        </m.span>
      )}
    </AnimatePresence>
  )
}

function StarCount({
  starCount,
  displayCount,
  formatCount,
  showPlusOne,
  className,
}: {
  starCount: number
  displayCount: number
  formatCount: (count: number) => string
  showPlusOne: boolean
  className?: string
}) {
  return (
    <span className={cn('relative inline-flex min-w-[2.5ch] justify-end tabular-nums', className)}>
      <span aria-hidden>{formatCount(displayCount)}</span>
      <span className="sr-only">{starCount} stars on GitHub</span>
      <PlusOne visible={showPlusOne} />
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
  const displayCount = useAnimatedCount(bumpedCount(starCount, hovered), shouldReduceMotion)

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <StarIcon hovered={hovered} shouldReduceMotion={shouldReduceMotion} />
      {starCount !== null && (
        <StarCount
          starCount={starCount}
          displayCount={displayCount}
          formatCount={formatCount}
          showPlusOne={hovered && shouldReduceMotion !== true}
          className={countClassName}
        />
      )}
    </span>
  )
}
