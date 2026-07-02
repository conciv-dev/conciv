import {useRef, useState} from 'react'
import {useGSAP} from '@gsap/react'
import gsap from 'gsap'
import {Check, RotateCcw} from 'lucide-react'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Card} from '@/components/ui/card'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {Transcript} from './transcript'
import {Composer} from './composer'
import {AppPreview} from './app-preview'
import {GhostCursor} from './ghost-cursor'
import {SparkMark} from '../spark-mark'
import {useDemo} from './use-demo'
import {useLocalModel} from './use-local-model'
import {PICKABLES, pickScenario, type Scenario} from './demo-data'
import {MODELS, type CssPatch} from './models'

const kebab = (key: string) => key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)

const formatPatch = (patch: CssPatch) =>
  Object.entries(patch)
    .map(([key, value]) => `${kebab(key)} → ${value}`)
    .join(' · ')

const selectorFor = (el: HTMLElement | null) => {
  if (!el) return 'element'
  const firstClass = el.classList[0] ? `.${el.classList[0]}` : ''
  return `${el.tagName.toLowerCase()}${firstClass}`
}

const cleanHtml = (el: HTMLElement | null, fallback: string) => {
  if (!el) return fallback
  const tag = el.tagName.toLowerCase()
  return `<${tag}>${el.textContent?.trim() ?? ''}</${tag}>`
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function Demo() {
  const [state, dispatch] = useDemo()
  const [input, setInput] = useState('')
  const model = useLocalModel()

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

  const onUngrab = () => {
    active.current = null
    setInput('')
    dispatch({type: 'ungrab'})
  }

  const applyPatch = contextSafe((el: HTMLElement | null, patch: CssPatch) => {
    if (!el) return
    if (reduced()) gsap.set(el, patch)
    else gsap.to(el, {...patch, duration: 0.5, ease: 'power2.out'})
  })

  const runCannedTail = (scenario: Scenario, el: HTMLElement | null) => {
    dispatch({type: 'push', message: {kind: 'tool', label: 'patch', detail: scenario.patchDetail}})
    dispatch({type: 'patch'})
    applyPatch(el, scenario.apply)
    dispatch({type: 'push', message: {kind: 'result', text: 'done — 1 element changed, saved to source'}})
  }

  const runLocal = async (text: string) => {
    const current = active.current
    const el = current ? grabbedEl(current.id) : null
    const scenario = current?.scenario ?? PICKABLES.cta.scenarios[0]
    dispatch({type: 'send', message: {kind: 'user', text, grabbedHtml: state.grabbed?.html}})
    setInput('')
    if (!el) {
      dispatch({type: 'push', message: {kind: 'result', text: 'grab an element first, then tell me what to change'}})
      return
    }
    const html = cleanHtml(el, state.grabbed?.html ?? '')
    const downloading = model.status !== 'ready'
    dispatch({
      type: 'push',
      message: {kind: 'think', text: downloading ? 'downloading the model (first run)…' : 'thinking locally…'},
    })
    await delay(300)
    dispatch({type: 'push', message: {kind: 'agent', text: 'On it — editing right here in your browser.'}})
    dispatch({type: 'push', message: {kind: 'tool', label: 'inspect', detail: selectorFor(el)}})
    try {
      const {patch, text: newText, ms} = await model.run(html, text)
      const keys = Object.keys(patch)
      const changes = keys.length + (newText ? 1 : 0)
      if (!changes) {
        runCannedTail(scenario, el)
        return
      }
      const detail = [newText ? `text → "${newText}"` : '', formatPatch(patch)].filter(Boolean).join(' · ')
      dispatch({type: 'push', message: {kind: 'tool', label: newText ? 'edit' : 'patch', detail}})
      dispatch({type: 'patch'})
      if (newText) el.textContent = newText
      if (keys.length) applyPatch(el, patch)
      dispatch({type: 'push', message: {kind: 'result', text: `done in ${Math.round(ms)}ms — ${changes} change(s)`}})
    } catch {
      runCannedTail(scenario, el)
    }
  }

  const onSend = () => {
    const text = input.trim()
    if (!text) return
    model.load()
    void runLocal(text)
  }

  return (
    <div className="relative" ref={scope}>
      <div
        className="pointer-events-none absolute -inset-3 -z-10 rounded-[28px] opacity-60 blur-2xl"
        style={{background: 'radial-gradient(60% 60% at 70% 20%, var(--od-accent-soft), transparent)'}}
      />
      <Card className="gap-0 overflow-hidden p-0 shadow-xl">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <SparkMark className="text-base text-primary" />
          <span className="text-[13.5px] font-semibold">conciv</span>
          <Badge className="bg-accent font-mono text-[10px] uppercase tracking-wide text-accent-foreground">
            in your app
          </Badge>
          <Select value={model.selected} onValueChange={model.choose}>
            <SelectTrigger
              size="sm"
              aria-label="Pick the local model"
              className="max-sm:hidden h-6 gap-1 rounded-md px-2 py-0 font-mono text-[10px] text-muted-foreground [&_svg:not([class*='size-'])]:size-3"
            >
              <SelectValue>{MODELS.find((option) => option.id === model.selected)?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent className="p-1 font-mono text-[11px]">
              {MODELS.map((option) => (
                <SelectItem key={option.id} value={option.id} className="py-1.5 pl-2.5 font-mono text-[11px]">
                  {option.label} <span className="text-muted-foreground">({option.size})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {model.status === 'loading' && (
            <Badge className="bg-primary/10 font-mono text-[10px] tracking-wide text-primary">{model.percent}%</Badge>
          )}
          {model.status === 'ready' && (
            <Badge className="gap-1 bg-primary/10 font-mono text-[10px] tracking-wide text-primary">
              {model.device}
              <Check className="size-3" />
            </Badge>
          )}
          {model.status === 'error' && (
            <Badge className="bg-destructive/10 font-mono text-[10px] tracking-wide text-destructive">offline</Badge>
          )}
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
            <span className="ml-auto whitespace-nowrap font-mono text-[12px] text-muted-foreground">live demo</span>
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
              onUngrab={onUngrab}
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
