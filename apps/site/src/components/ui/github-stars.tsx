import {Star} from 'lucide-react'
import {m, useReducedMotion, useSpring, useTransform} from 'motion/react'
import {useEffect} from 'react'
import {cn} from '@/lib/utils'

const HOVER_SPRING = {stiffness: 260, damping: 26, mass: 1}
const TILT_DEGREES = -8
const GROW = 0.06

function useHoverProgress(hovered: boolean, shouldReduceMotion: boolean | null) {
  const progress = useSpring(0, HOVER_SPRING)
  useEffect(() => {
    const target = hovered ? 1 : 0
    if (shouldReduceMotion) {
      progress.jump(target)
      return
    }
    progress.set(target)
  }, [hovered, progress, shouldReduceMotion])
  return progress
}

function StarIcon({hovered}: {hovered: boolean}) {
  const shouldReduceMotion = useReducedMotion()
  const progress = useHoverProgress(hovered, shouldReduceMotion)
  const transform = useTransform(progress, (value) =>
    shouldReduceMotion ? 'none' : `rotate(${TILT_DEGREES * value}deg) scale(${1 + GROW * value})`,
  )
  const clipPath = useTransform(progress, (value) => `inset(${(1 - value) * 100}% 0 0 0)`)
  return (
    <m.span aria-hidden className="relative inline-flex" style={{transform}}>
      <Star className="size-4" />
      <m.span className="absolute inset-0 inline-flex text-[var(--od-star)]" style={{clipPath}}>
        <Star className="size-4 fill-current" />
      </m.span>
    </m.span>
  )
}

function StarCount({starCount, formatCount}: {starCount: number; formatCount: (count: number) => string}) {
  return (
    <span className="tabular-nums">
      <span aria-hidden>{formatCount(starCount)}</span>
      <span className="sr-only">{starCount} stars on GitHub</span>
    </span>
  )
}

export function GitHubStars({
  starCount,
  formatCount,
  hovered = false,
  className,
}: {
  starCount: number | null
  formatCount: (count: number) => string
  hovered?: boolean
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <StarIcon hovered={hovered} />
      {starCount !== null && <StarCount starCount={starCount} formatCount={formatCount} />}
    </span>
  )
}
