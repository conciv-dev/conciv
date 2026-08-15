import {ClientOnly} from '@tanstack/react-router'
import {Suspense, lazy} from 'react'
import {useIsMobile} from '@/lib/use-is-mobile'
import {HERO_HEADLINE} from './hero'

const Demo = lazy(() => import('./demo/demo').then((module) => ({default: module.Demo})))

const HERO_DEMO_ALT = `${HERO_HEADLINE} A screenshot of the conciv chat panel beside a running app, mid-edit on a picked element.`

export function ProductFrame() {
  const isMobile = useIsMobile()
  return (
    <div className="px-8">
      <div className="dark mx-auto max-w-[1180px] overflow-hidden rounded-[10px] border border-(--od-line) bg-(--od-paper) shadow-[0_1px_0_rgba(0,0,0,.04),0_24px_48px_-24px_rgba(0,0,0,.25)]">
        <div className="flex items-center gap-2 border-b border-(--od-line) px-3 py-2">
          <span aria-hidden className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-(--od-line)" />
            <span className="size-2.5 rounded-full bg-(--od-line)" />
            <span className="size-2.5 rounded-full bg-(--od-line)" />
          </span>
          <span className="od-mono ml-2 rounded-md bg-(--od-panel) px-2.5 py-0.5 text-[11px] text-(--od-muted)">
            localhost:3000
          </span>
        </div>
        <div className="aspect-[16/10]">
          {isMobile === true && (
            <img
              src="/screenshots/hero-demo.webp"
              width={1440}
              height={900}
              alt={HERO_DEMO_ALT}
              className="size-full object-cover"
            />
          )}
          {isMobile === false && (
            <ClientOnly>
              <Suspense fallback={null}>
                <Demo />
              </Suspense>
            </ClientOnly>
          )}
        </div>
      </div>
      <p className="od-mono mx-auto mt-3 max-w-[1180px] text-[12px] text-muted-foreground">
        The live demo runs a small local model in your browser. Connect your own agent with "Try it live".
      </p>
    </div>
  )
}
