import {m} from 'motion/react'
import {Tabs as TabsPrimitive} from 'radix-ui'
import {ShikiMagicMovePrecompiled} from '@shikijs/magic-move/react'
import {createContext, useContext, useRef, useState, type ReactNode} from 'react'
import {Check, Copy} from 'lucide-react'
import '@shikijs/magic-move/style.css'
import {cleanSnippet, type FrameworkSnippet} from './framework-snippets'
import {MAGIC_MOVE_STEP_IDS, MAGIC_MOVE_STEPS, SNIPPET_TWOSLASH, type SnippetHover} from './framework-snippets.gen'

type Anchor = {left: number; top: number; width: number; height: number; hover?: SnippetHover; caret?: boolean}

function measureAnchors(container: HTMLElement, snippetId: string): Anchor[] {
  const info = SNIPPET_TWOSLASH.find((entry) => entry.id === snippetId)
  if (!info) return []
  const base = container.getBoundingClientRect()
  const items = [...container.querySelectorAll<HTMLElement>('.shiki-magic-move-item')]
  const nth = (target: string, occurrence: number) =>
    items.filter((el) => el.textContent?.trim() === target)[occurrence]
  const toBox = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    return {left: rect.left - base.left, top: rect.top - base.top, width: rect.width, height: rect.height}
  }
  const hovers = info.hovers.flatMap((hover) => {
    const el = nth(hover.target, hover.occurrence)
    return el ? [{...toBox(el), hover}] : []
  })
  const caretEl = info.completion ? nth(info.completion.target, 0) : undefined
  const caret = caretEl ? [{...toBox(caretEl), caret: true}] : []
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

function Root({snippets, children}: {snippets: FrameworkSnippet[]; children: ReactNode}) {
  const [activeId, setActiveId] = useState(snippets[0]?.id ?? '')
  const active = snippets.find((snippet) => snippet.id === activeId) ?? snippets[0]

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
  return (
    <TabsPrimitive.List
      aria-label="Frameworks"
      className="mb-2.5 flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-[10px] border bg-card p-[3px]"
    >
      {snippets.map((snippet) => (
        <Trigger key={snippet.id} snippet={snippet} />
      ))}
    </TabsPrimitive.List>
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
      <CopyButton />
    </div>
  )
}

function CopyButton() {
  const {active} = useFrameworkTabs()
  const [copied, setCopied] = useState(false)
  const copyable = cleanSnippet(active.code ?? '')

  const copy = () => {
    void navigator.clipboard.writeText(copyable)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy config"
      data-copied={copied}
      className="group inline-grid size-7 place-items-center rounded-md border bg-background text-muted-foreground transition-colors hover:text-foreground active:scale-90"
    >
      <Copy className="col-start-1 row-start-1 size-3.5 scale-100 opacity-100 transition-all duration-200 group-data-[copied=true]:scale-50 group-data-[copied=true]:opacity-0" />
      <Check className="col-start-1 row-start-1 size-3.5 scale-50 text-primary opacity-0 transition-all duration-200 group-data-[copied=true]:scale-100 group-data-[copied=true]:opacity-100" />
    </button>
  )
}

function Code() {
  const {active} = useFrameworkTabs()
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef(active.id)
  activeIdRef.current = active.id
  const step = Math.max(0, MAGIC_MOVE_STEP_IDS.indexOf(active.id))
  const completion = SNIPPET_TWOSLASH.find((entry) => entry.id === active.id)?.completion ?? null

  const settle = () => {
    const container = containerRef.current
    if (!container) return
    setAnchors(active.twoslash === true ? measureAnchors(container, activeIdRef.current) : [])
  }

  const attach = (el: HTMLDivElement | null) => {
    containerRef.current = el
    if (el && active.twoslash === true) requestAnimationFrame(settle)
  }

  return (
    <div ref={attach} className="od-snippet relative overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-[1.7]">
      <ShikiMagicMovePrecompiled
        steps={MAGIC_MOVE_STEPS}
        step={step}
        options={{duration: 500, stagger: 2, animateContainer: true, containerStyle: false}}
        onStart={() => setAnchors([])}
        onEnd={settle}
      />
      {anchors.map((anchor, index) => (
        <span
          key={index}
          className="od-hover-anchor"
          style={{left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height}}
        >
          {anchor.hover && (
            <span className="twoslash-popup-container">
              <code dangerouslySetInnerHTML={{__html: anchor.hover.html}} />
              {anchor.hover.docs && <span className="twoslash-popup-docs">{anchor.hover.docs}</span>}
            </span>
          )}
          {anchor.caret === true && completion && (
            <>
              <span className="od-caret" />
              <ul className="twoslash-completion-list">
                {completion.items.map((name) => (
                  <li key={name}>
                    <span className="twoslash-completions-matched">{completion.target}</span>
                    <span className="twoslash-completions-unmatched">{name.slice(completion.target.length)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </span>
      ))}
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

export const FrameworkTabs = {Root, List, Trigger, Panel, FileBar, CopyButton, Code, Note}
