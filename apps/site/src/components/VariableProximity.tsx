import {useEffect, useMemo, useRef, type CSSProperties, type HTMLAttributes, type RefObject} from 'react'

type Falloff = 'linear' | 'exponential' | 'gaussian'

type VariableProximityProps = HTMLAttributes<HTMLSpanElement> & {
  label: string
  fromFontVariationSettings: string
  toFontVariationSettings: string
  containerRef: RefObject<HTMLElement | null>
  radius?: number
  falloff?: Falloff
  className?: string
  style?: CSSProperties
}

const parseSettings = (value: string) =>
  new Map(
    value
      .split(',')
      .map((part) => part.trim())
      .map((part) => {
        const [name, axisValue] = part.split(' ')
        return [name.replace(/['"]/g, ''), Number.parseFloat(axisValue)] as const
      }),
  )

const falloffValue = (kind: Falloff, distance: number, radius: number) => {
  const norm = Math.min(Math.max(1 - distance / radius, 0), 1)
  if (kind === 'exponential') return norm ** 2
  if (kind === 'gaussian') return Math.exp(-((distance / (radius / 2)) ** 2) / 2)
  return norm
}

export default function VariableProximity({
  label,
  fromFontVariationSettings,
  toFontVariationSettings,
  containerRef,
  radius = 50,
  falloff = 'linear',
  className,
  style,
  ...rest
}: VariableProximityProps) {
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([])

  const axes = useMemo(() => {
    const from = parseSettings(fromFontVariationSettings)
    const to = parseSettings(toFontVariationSettings)
    return [...from.entries()].map(([axis, fromValue]) => ({axis, fromValue, toValue: to.get(axis) ?? fromValue}))
  }, [fromFontVariationSettings, toFontVariationSettings])

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const update = (clientX: number, clientY: number) => {
      frame = 0
      letterRefs.current.forEach((letter) => {
        if (!letter) return
        const rect = letter.getBoundingClientRect()
        const distance = Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2))
        if (distance >= radius) {
          letter.style.fontVariationSettings = fromFontVariationSettings
          return
        }
        const strength = falloffValue(falloff, distance, radius)
        letter.style.fontVariationSettings = axes
          .map(({axis, fromValue, toValue}) => `'${axis}' ${fromValue + (toValue - fromValue) * strength}`)
          .join(', ')
      })
    }
    const onPointerMove = (event: PointerEvent) => {
      if (frame) return
      frame = requestAnimationFrame(() => update(event.clientX, event.clientY))
    }
    const target = containerRef.current ?? window
    target.addEventListener('pointermove', onPointerMove as EventListener)
    return () => {
      target.removeEventListener('pointermove', onPointerMove as EventListener)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [axes, containerRef, falloff, fromFontVariationSettings, radius])

  const words = label.split(' ')
  let letterIndex = -1

  return (
    <span className={className} style={{display: 'inline', ...style}} {...rest}>
      {words.map((word, wordIndex) => (
        <span key={wordIndex} className="inline-block whitespace-nowrap">
          {[...word].map((letter) => {
            letterIndex += 1
            const current = letterIndex
            return (
              <span
                key={current}
                aria-hidden
                className="inline-block"
                ref={(el) => {
                  letterRefs.current[current] = el
                }}
              >
                {letter}
              </span>
            )
          })}
          {wordIndex < words.length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
      <span className="sr-only">{label}</span>
    </span>
  )
}
