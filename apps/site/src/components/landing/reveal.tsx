import {m, useReducedMotion} from 'motion/react'
import type {ReactNode} from 'react'

const REVEAL_DISTANCE = 12
const REVEAL_DURATION = 0.4

export function Reveal({children, className}: {children: ReactNode; className?: string}) {
  const reducedMotion = useReducedMotion()
  if (reducedMotion) return <div className={className}>{children}</div>
  return (
    <m.div
      className={className}
      initial={{opacity: 0, y: REVEAL_DISTANCE}}
      whileInView={{opacity: 1, y: 0}}
      viewport={{once: true}}
      transition={{duration: REVEAL_DURATION, ease: 'easeOut'}}
    >
      {children}
    </m.div>
  )
}
