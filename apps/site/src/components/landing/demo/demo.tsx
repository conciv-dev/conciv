import {useRef, useState} from 'react'
import {useGSAP} from '@gsap/react'
import gsap from 'gsap'
import {RotateCcw} from 'lucide-react'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Transcript} from './transcript'
import {Composer} from './composer'
import {AppPreview} from './app-preview'
import {GhostCursor} from './ghost-cursor'
import {useDemo} from './use-demo'
import {buildTurn, PICKABLES, pickScenario, type Scenario} from './demo-data'

export function Demo() {
  const [state, dispatch] = useDemo()
  const [input, setInput] = useState('')

  const scope = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const grabRef = useRef<HTMLButtonElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)

  const active = useRef<{id: string; scenario: Scenario} | null>(null)

  const grabbedEl = (id: string) =>
    scope.current?.querySelector(`[data-pickable="${id}"]`)?.firstElementChild as HTMLElement | null

  const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useGSAP(
    () => {
      if (reduced() || !ghostRef.current || !grabRef.current) return
      const root = scope.current!.getBoundingClientRect()
      const pill = grabRef.current.getBoundingClientRect()
      const x = pill.left - root.left + pill.width / 2
      const y = pill.top - root.top + pill.height / 2
      gsap
        .timeline({delay: 0.8})
        .set(ghostRef.current, {x: x - 60, y: y - 50})
        .to(ghostRef.current, {autoAlpha: 1, duration: 0.3})
        .to(ghostRef.current, {x, y, duration: 1, ease: 'power3.inOut'})
        .to(ghostRef.current, {scale: 0.82, duration: 0.16, yoyo: true, repeat: 1})
        .to(ghostRef.current, {autoAlpha: 0, duration: 0.3}, '+=0.2')
    },
    {scope},
  )

  useGSAP(
    () => {
      if (reduced() || !grabRef.current) return
      if (state.picking || state.grabbed) return
      const tween = gsap.to(grabRef.current, {
        boxShadow: '0 0 0 5px var(--od-accent-soft)',
        repeat: -1,
        yoyo: true,
        duration: 0.95,
        ease: 'sine.inOut',
      })
      return () => tween.kill()
    },
    {scope, dependencies: [state.picking, state.grabbed?.id]},
  )

  useGSAP(
    () => {
      if (!viewportRef.current) return
      const viewport = viewportRef.current.closest('[data-slot="scroll-area-viewport"]') as HTMLElement | null
      if (!reduced()) {
        const rows = viewportRef.current.querySelectorAll('.od-msg')
        const last = rows[rows.length - 1]
        if (last) gsap.from(last, {autoAlpha: 0, y: 8, duration: 0.35, ease: 'power2.out'})
      }

      if (viewport) viewport.scrollTop = viewport.scrollHeight
    },
    {scope, dependencies: [state.messages.length]},
  )

  const onPick = (id: string) => {
    const scenario = pickScenario(PICKABLES[id])
    active.current = {id, scenario}
    dispatch({type: 'grab', pickable: PICKABLES[id]})
    setInput(scenario.prompt)
  }

  const {contextSafe} = useGSAP({scope})

  const onRestart = contextSafe(() => {
    scope.current?.querySelectorAll('[data-pickable] > *').forEach((el) => gsap.set(el, {clearProps: 'all'}))
    active.current = null
    setInput('')
    dispatch({type: 'reset'})
  })

  const onSend = contextSafe(() => {
    const text = input.trim()
    if (!text) return
    const current = active.current
    const scenario = current?.scenario ?? PICKABLES.cta.scenarios[0]
    dispatch({type: 'send', message: {kind: 'user', text, grabbedHtml: state.grabbed?.html}})
    setInput('')

    const tl = gsap.timeline()
    for (const beat of buildTurn(scenario)) {
      tl.add(() => {
        if (beat.message) dispatch({type: 'push', message: beat.message})
        if (beat.patch) {
          dispatch({type: 'patch'})
          const el = current ? grabbedEl(current.id) : null
          if (el) {
            if (reduced()) gsap.set(el, scenario.apply)
            else gsap.to(el, {...scenario.apply, duration: 0.5, ease: 'power2.out'})
          }
        }
      }, beat.at)
    }
  })

  return (
    <div className="relative" ref={scope}>
      <div
        className="pointer-events-none absolute -inset-3 -z-10 rounded-[28px] opacity-60 blur-2xl"
        style={{background: 'radial-gradient(60% 60% at 70% 20%, var(--od-accent-soft), transparent)'}}
      />
      <Card className="gap-0 overflow-hidden p-0 shadow-xl">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <span className="text-base text-primary">✦</span>
          <span className="text-[13.5px] font-semibold">conciv</span>
          <Badge className="bg-accent font-mono text-[10px] uppercase tracking-wide text-accent-foreground">
            in your app
          </Badge>
          {state.done ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRestart}
              className="ml-auto h-7 gap-1.5 px-2 font-mono text-[12px] text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
              Restart demo
            </Button>
          ) : (
            <span className="ml-auto font-mono text-[12px] text-muted-foreground">live demo</span>
          )}
        </div>

        <div className="grid h-[460px] grid-cols-1 sm:grid-cols-2">
          <div className="flex min-h-0 flex-col border-r">
            <Transcript messages={state.messages} viewportRef={viewportRef} />
            <Composer
              grabbed={state.grabbed}
              picking={state.picking}
              value={input}
              onValueChange={setInput}
              onArm={() => dispatch({type: 'arm', on: !state.picking})}
              onSend={onSend}
              grabRef={grabRef}
            />
          </div>
          <AppPreview picking={state.picking} onPick={onPick} />
        </div>
      </Card>

      <GhostCursor cursorRef={ghostRef} />
    </div>
  )
}
