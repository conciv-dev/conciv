import {gsap} from 'gsap'
import {ScrollTrigger} from 'gsap/ScrollTrigger'
import {ReactLenis, useLenis, type LenisRef} from 'lenis/react'
import {useState, type ReactNode} from 'react'

gsap.registerPlugin(ScrollTrigger)

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function SmoothScroll({children}: {children: ReactNode}) {
  const [reduced] = useState(prefersReducedMotion)

  const attach = (ref: LenisRef | null) => {
    const lenis = ref?.lenis
    if (!lenis || reduced) return
    lenis.on('scroll', ScrollTrigger.update)
    const drive = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(drive)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(drive)
    }
  }

  return (
    <ReactLenis root options={{autoRaf: false, smoothWheel: !reduced}} ref={attach}>
      {children}
    </ReactLenis>
  )
}

export function useSmoothAnchor() {
  const lenis = useLenis()
  return (hash: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!lenis) return
    event.preventDefault()
    lenis.scrollTo(hash, {offset: -24})
  }
}
