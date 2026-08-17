import {ClientOnly} from '@tanstack/react-router'
import {Suspense, lazy, useCallback, useState} from 'react'
import {BrowserFrame} from '@/components/ui/browser-frame'
import {FrameBackdrop} from './frame-backdrop'
import {useIsMobile} from '@/lib/use-is-mobile'
import {findScreenshot} from '@/lib/screenshots'

const Demo = lazy(() => import('./demo/demo').then((module) => ({default: module.Demo})))

const poster = findScreenshot('hero-demo.webp')

export function ProductFrame() {
  const isMobile = useIsMobile()
  const [demoReady, setDemoReady] = useState(false)
  const onDemoReady = useCallback(() => setDemoReady(true), [])

  return (
    <section className="od-ruled">
      <div className="od-page">
        <div className="od-col">
          <FrameBackdrop />
          <div className="od-inset od-frame-pad relative">
            <BrowserFrame url="localhost:3000" className="dark">
              <div className="relative aspect-[8/5]">
                <img
                  src={`/screenshots/${poster.file}`}
                  width={poster.width}
                  height={poster.height}
                  alt={poster.alt}
                  fetchPriority="high"
                  decoding="async"
                  aria-hidden={demoReady}
                  className="absolute inset-0 size-full object-cover"
                />
                {isMobile === false && (
                  <ClientOnly>
                    <Suspense fallback={null}>
                      <div
                        data-ready={demoReady ? '' : undefined}
                        className="absolute inset-0 opacity-0 transition-opacity duration-500 ease-[var(--od-ease-out)] motion-reduce:transition-none data-[ready]:opacity-100"
                      >
                        <Demo onReady={onDemoReady} />
                      </div>
                    </Suspense>
                  </ClientOnly>
                )}
              </div>
              <p className="od-mono od-caption border-t px-4 py-2 text-muted-foreground">
                Live demo on a small in-browser model. "Try it live" connects your own agent.
              </p>
            </BrowserFrame>
          </div>
        </div>
      </div>
    </section>
  )
}
