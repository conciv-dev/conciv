import {m} from 'motion/react'
import {Tabs as TabsPrimitive} from 'radix-ui'
import {ShikiMagicMovePrecompiled} from '@shikijs/magic-move/react'
import {createContext, useCallback, useContext, useRef, useState, type ReactNode} from 'react'
import '@shikijs/magic-move/style.css'
import {HoverCard, HoverCardContent, HoverCardTrigger} from '@/components/ui/hover-card'
import {Select, SelectContent, SelectItem, SelectTrigger} from '@/components/ui/select'
import {CopyButton} from './copy-button'
import {cleanSnippet, type FrameworkSnippet} from './framework-snippets'
import {MAGIC_MOVE_STEP_IDS, MAGIC_MOVE_STEPS, SNIPPET_TWOSLASH, type SnippetHover} from './framework-snippets.gen'

type Anchor = {left: number; top: number; width: number; height: number; hover?: SnippetHover; caret?: boolean}

const JOINED = /[\w$@]/

function targetRects(items: HTMLElement[], target: string): DOMRect[] {
  return items.flatMap((el) => {
    const text = el.textContent ?? ''
    const index = text.indexOf(target)
    if (index === -1) return []
    const before = text[index - 1]
    const after = text[index + target.length]
    if ((before && JOINED.test(before)) || (after && JOINED.test(after))) return []
    const node = el.firstChild
    if (node?.nodeType !== Node.TEXT_NODE || index + target.length > (node.textContent?.length ?? 0)) {
      return [el.getBoundingClientRect()]
    }
    const range = document.createRange()
    range.setStart(node, index)
    range.setEnd(node, index + target.length)
    return [range.getBoundingClientRect()]
  })
}

function measureAnchors(container: HTMLElement, snippetId: string): Anchor[] {
  const info = SNIPPET_TWOSLASH.find((entry) => entry.id === snippetId)
  if (!info) return []
  const base = container.getBoundingClientRect()
  const items = [...container.querySelectorAll<HTMLElement>('.shiki-magic-move-item')]
  const toBox = (rect: DOMRect) => ({
    left: rect.left - base.left,
    top: rect.top - base.top,
    width: rect.width,
    height: rect.height,
  })
  const hovers = info.hovers.flatMap((hover) => {
    const rect = targetRects(items, hover.target)[hover.occurrence]
    return rect ? [{...toBox(rect), hover}] : []
  })
  const caretRect = info.completion ? targetRects(items, info.completion.target)[0] : undefined
  const caret = caretRect ? [{...toBox(caretRect), caret: true}] : []
  return [...hovers, ...caret]
}

type FrameworkTabsContextValue = {
  snippets: FrameworkSnippet[]
  active: FrameworkSnippet
  select: (id: string) => void
}

const FrameworkTabsContext = createContext<FrameworkTabsContextValue | null>(null)

function useFrameworkTabs(): FrameworkTabsContextValue {
  const value = useContext(FrameworkTabsContext)
  if (!value) throw new Error('FrameworkTabs.* must be used inside FrameworkTabs.Root')
  return value
}

const activeSnippet = (snippets: FrameworkSnippet[], id: string) =>
  snippets.find((snippet) => snippet.id === id) ?? snippets[0]

function Root({snippets, children}: {snippets: FrameworkSnippet[]; children: ReactNode}) {
  const [activeId, setActiveId] = useState(snippets[0]?.id ?? '')
  const active = activeSnippet(snippets, activeId)
  if (!active) return null

  return (
    <FrameworkTabsContext.Provider value={{snippets, active, select: setActiveId}}>
      <TabsPrimitive.Root value={activeId} onValueChange={setActiveId} className="min-w-0">
        {children}
      </TabsPrimitive.Root>
    </FrameworkTabsContext.Provider>
  )
}

function List() {
  const {snippets} = useFrameworkTabs()
  const [clipped, setClipped] = useState(false)
  const observerRef = useRef<ResizeObserver | null>(null)

  const attach = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!el) return
    const measure = () => setClipped(el.scrollWidth > el.clientWidth + 1)
    observerRef.current = new ResizeObserver(measure)
    observerRef.current.observe(el)
    measure()
  }, [])

  return (
    <>
      <FrameworkSelect />
      <div className="relative mb-2.5 hidden w-fit max-w-full sm:block">
        <TabsPrimitive.List
          ref={attach}
          aria-label="Frameworks"
          className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-[10px] border bg-card p-[3px]"
        >
          {snippets.map((snippet) => (
            <Trigger key={snippet.id} snippet={snippet} />
          ))}
        </TabsPrimitive.List>
        {clipped && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-[3px] right-[3px] w-8 rounded-r-[8px] bg-gradient-to-l from-card to-transparent"
          />
        )}
      </div>
    </>
  )
}

function FrameworkSelect() {
  const {snippets, active, select} = useFrameworkTabs()
  return (
    <Select value={active.id} onValueChange={select}>
      <SelectTrigger
        aria-label="Framework"
        className="mb-2.5 h-auto w-full gap-2 rounded-[10px] border bg-card px-3 py-2 font-mono text-[12.5px] font-semibold sm:hidden"
      >
        <span className="flex items-center gap-2">
          <img src={active.icon} alt="" className="size-[15px]" />
          {active.label}
        </span>
      </SelectTrigger>
      <SelectContent position="popper" className="w-(--radix-select-trigger-width) font-mono text-[12.5px]">
        {snippets.map((snippet) => (
          <SelectItem key={snippet.id} value={snippet.id} disabled={snippet.soon} className="gap-2 font-mono">
            <span className="flex items-center gap-2">
              <img src={snippet.icon} alt="" className="size-[15px]" />
              {snippet.label}
              {snippet.soon && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[8.5px] uppercase tracking-[0.08em] text-accent-foreground">
                  soon
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Trigger({snippet}: {snippet: FrameworkSnippet}) {
  const {active} = useFrameworkTabs()
  const scrollIntoView = (event: React.MouseEvent<HTMLButtonElement>) =>
    event.currentTarget.scrollIntoView({inline: 'nearest', block: 'nearest', behavior: 'smooth'})

  return (
    <TabsPrimitive.Trigger
      value={snippet.id}
      disabled={snippet.soon}
      onClick={scrollIntoView}
      className="group relative inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-mono text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:text-muted-foreground data-[state=active]:text-foreground"
    >
      {active.id === snippet.id && (
        <m.span
          layoutId="framework-tabs-pill"
          transition={{type: 'spring', stiffness: 400, damping: 34}}
          className="absolute inset-0 rounded-lg border bg-background shadow-[0_2px_8px_-4px_oklch(0.23_0.012_65/0.4)]"
        />
      )}
      <img
        src={snippet.icon}
        alt=""
        className="relative z-10 size-[15px] opacity-65 grayscale transition-[filter,opacity] duration-200 group-data-[state=active]:opacity-100 group-data-[state=active]:grayscale-0"
      />
      <span className="relative z-10">{snippet.label}</span>
      {snippet.soon && (
        <span className="relative z-10 rounded-full bg-accent px-1.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.08em] text-accent-foreground">
          soon
        </span>
      )}
    </TabsPrimitive.Trigger>
  )
}

function Panel({children}: {children: ReactNode}) {
  return <div className="overflow-hidden rounded-xl border bg-card">{children}</div>
}

function FileBar() {
  const {active} = useFrameworkTabs()
  return (
    <div className="flex items-center justify-between border-b px-3.5 py-2">
      <span className="font-mono text-[11px] text-muted-foreground">{active.file}</span>
      <Copy />
    </div>
  )
}

function Copy() {
  const {active} = useFrameworkTabs()
  return (
    <CopyButton.Root text={cleanSnippet(active.code ?? '')}>
      <CopyButton.Trigger label="Copy config" />
      <CopyButton.Feedback />
    </CopyButton.Root>
  )
}

type EdgeFade = {start: boolean; end: boolean}

function readEdgeFade(el: HTMLElement): EdgeFade {
  return {start: el.scrollLeft > 1, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1}
}

function useEdgeFade() {
  const [fade, setFade] = useState<EdgeFade>({start: false, end: false})
  const elRef = useRef<HTMLElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  const refresh = useCallback(() => {
    const el = elRef.current
    if (!el) return
    const next = readEdgeFade(el)
    setFade((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
  }, [])

  const watch = useCallback(
    (el: HTMLElement | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      elRef.current = el
      if (!el) return
      observerRef.current = new ResizeObserver(refresh)
      observerRef.current.observe(el)
      requestAnimationFrame(refresh)
    },
    [refresh],
  )

  return {fade, watch, refresh}
}

function FadeEdges({fade}: {fade: EdgeFade}) {
  return (
    <>
      {fade.start && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent"
        />
      )}
      {fade.end && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
        />
      )}
    </>
  )
}

function Code() {
  const {active} = useFrameworkTabs()
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const {fade, watch, refresh} = useEdgeFade()
  const containerRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef(active.id)
  activeIdRef.current = active.id
  const step = Math.max(0, MAGIC_MOVE_STEP_IDS.indexOf(active.id))
  const completion = SNIPPET_TWOSLASH.find((entry) => entry.id === active.id)?.completion ?? null

  const twoslashRef = useRef(active.twoslash === true)
  twoslashRef.current = active.twoslash === true

  const settle = () => {
    const container = containerRef.current
    if (!container) return
    setAnchors(twoslashRef.current ? measureAnchors(container, activeIdRef.current) : [])
    refresh()
  }
  const settleRef = useRef(settle)
  settleRef.current = settle

  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el
      watch(el)
      if (el && twoslashRef.current) requestAnimationFrame(() => settleRef.current())
    },
    [watch],
  )

  return (
    <div className="relative">
      <div
        ref={attach}
        onScroll={refresh}
        tabIndex={0}
        role="region"
        aria-label={`${active.file ?? active.label} config`}
        className="od-snippet relative overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-[1.7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <ShikiMagicMovePrecompiled
          steps={MAGIC_MOVE_STEPS}
          step={step}
          options={{duration: 500, stagger: 2, animateContainer: true, containerStyle: false}}
          onStart={() => setAnchors([])}
          onEnd={settle}
        />
        {anchors.map((anchor, index) => (
          <HoverCard key={index} openDelay={150} closeDelay={250}>
            <HoverCardTrigger asChild>
              <span
                className="od-hover-anchor"
                style={{left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height}}
              >
                {anchor.caret === true && <span className="od-caret" />}
              </span>
            </HoverCardTrigger>
            <HoverCardContent
              side="bottom"
              align="start"
              sideOffset={6}
              className="od-popup w-auto max-w-[min(440px,80vw)] px-3.5 py-2.5 font-mono text-[11.5px] leading-[1.6]"
            >
              {anchor.hover && (
                <>
                  <code
                    className="block overflow-x-auto whitespace-pre"
                    dangerouslySetInnerHTML={{__html: anchor.hover.html}}
                  />
                  {anchor.hover.docs && (
                    <p className="mt-1.5 border-t border-dashed pt-1.5 font-sans text-muted-foreground">
                      {anchor.hover.docs}
                    </p>
                  )}
                </>
              )}
              {anchor.caret === true && completion && (
                <ul className="flex flex-col gap-0.5">
                  {completion.items.map((name) => (
                    <li key={name} className="rounded px-1.5 py-0.5 first:bg-accent">
                      <span className="font-semibold text-primary">{completion.target}</span>
                      <span className="text-muted-foreground">{name.slice(completion.target.length)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>
      <FadeEdges fade={fade} />
    </div>
  )
}

function Note() {
  const {active} = useFrameworkTabs()
  if (!active.note) return null
  return (
    <div className="border-t border-dashed px-3.5 py-2 font-mono text-[11px] text-muted-foreground">{active.note}</div>
  )
}

export const FrameworkTabs = {Root, List, Trigger, Panel, FileBar, Copy, Code, Note}
