import {ClientOnly} from '@tanstack/react-router'
import {Suspense, lazy, useCallback, useState} from 'react'
import {BrowserFrame} from '@/components/ui/browser-frame'
import {useIsMobile} from '@/lib/use-is-mobile'
import {findScreenshot} from '@/lib/screenshots'

const Demo = lazy(() => import('./demo/demo').then((module) => ({default: module.Demo})))

const poster = findScreenshot('hero-demo.webp')

export function ProductFrame() {
  const isMobile = useIsMobile()
  const [demoMounted, setDemoMounted] = useState(false)
  const attachDemo = useCallback((node: HTMLDivElement | null) => {
    if (node) setDemoMounted(true)
  }, [])

  return (
    <section className="od-ruled">
      <div className="od-page">
        <div className="od-col">
          <BrowserFrame url="localhost:3000" className="dark">
            <div className="relative aspect-[8/5]">
              <img
                src={`/screenshots/${poster.file}`}
                width={poster.width}
                height={poster.height}
                alt={poster.alt}
                fetchPriority="high"
                decoding="async"
                aria-hidden={demoMounted}
                className="absolute inset-0 size-full object-cover"
              />
              {isMobile === false && (
                <ClientOnly>
                  <Suspense fallback={null}>
                    <div ref={attachDemo} className="animate-in fade-in absolute inset-0 duration-500 fill-mode-both">
                      <Demo />
                    </div>
                  </Suspense>
                </ClientOnly>
              )}
            </div>
            <p className="od-mono od-caption border-t px-4 py-2 text-muted-foreground">
              The live demo runs a small local model in your browser. Connect your own agent with "Try it live".
            </p>
          </BrowserFrame>
        </div>
      </div>
    </section>
  )
}
