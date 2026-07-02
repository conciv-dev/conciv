import {LazyMotion, MotionConfig} from 'motion/react'
import type {ReactNode} from 'react'

const loadFeatures = () => import('./motion-features').then((mod) => mod.domAnimation)

export function LandingMotion({children}: {children: ReactNode}) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
