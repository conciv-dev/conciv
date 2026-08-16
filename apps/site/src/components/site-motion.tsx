import {LazyMotion, MotionConfig} from 'motion/react'
import type {ReactNode} from 'react'

const loadFeatures = () => import('@/lib/motion-features').then((mod) => mod.domMax)

export function SiteMotion({children}: {children: ReactNode}) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
