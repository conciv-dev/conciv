import {LazyMotion} from 'motion/react'
import type {ReactNode} from 'react'

const loadFeatures = () => import('./motion-features').then((mod) => mod.domAnimation)

export function LandingMotion({children}: {children: ReactNode}) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  )
}
