import React, {useState, useEffect, useRef, ReactNode, HTMLAttributes} from 'react'

interface MagnetProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: number
  disabled?: boolean
  magnetStrength?: number
  activeTransition?: string
  inactiveTransition?: string
  wrapperClassName?: string
  innerClassName?: string
}

const Magnet: React.FC<MagnetProps> = ({
  children,
  padding = 100,
  disabled = false,
  magnetStrength = 2,
  activeTransition = 'transform 0.3s ease-out',
  inactiveTransition = 'transform 0.5s ease-in-out',
  wrapperClassName = '',
  innerClassName = '',
  ...props
}) => {
  const [isActive, setIsActive] = useState<boolean>(false)
  const magnetRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const inner = innerRef.current
    if (disabled) {
      if (inner) inner.style.transform = 'translate3d(0px, 0px, 0)'
      setIsActive(false)
      return
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let rect = magnetRef.current?.getBoundingClientRect() ?? null
    let frame = 0
    let pending: MouseEvent | null = null

    const measure = () => {
      rect = magnetRef.current?.getBoundingClientRect() ?? null
    }

    const process = () => {
      frame = 0
      const e = pending
      const el = innerRef.current
      if (!e || !rect || !el) return
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const distX = Math.abs(centerX - e.clientX)
      const distY = Math.abs(centerY - e.clientY)
      if (distX < rect.width / 2 + padding && distY < rect.height / 2 + padding) {
        setIsActive(true)
        const offsetX = (e.clientX - centerX) / magnetStrength
        const offsetY = (e.clientY - centerY) / magnetStrength
        el.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`
      } else {
        setIsActive(false)
        el.style.transform = 'translate3d(0px, 0px, 0)'
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      pending = e
      if (frame === 0) frame = requestAnimationFrame(process)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [padding, disabled, magnetStrength])

  const transitionStyle = isActive ? activeTransition : inactiveTransition

  return (
    <div
      ref={magnetRef}
      className={wrapperClassName}
      style={{position: 'relative', display: 'inline-block'}}
      {...props}
    >
      <div
        ref={innerRef}
        className={innerClassName}
        style={{
          transition: transitionStyle,
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default Magnet
