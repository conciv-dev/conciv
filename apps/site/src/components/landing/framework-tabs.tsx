import {useReducedMotion} from 'motion/react'
import {Tabs as TabsPrimitive} from 'radix-ui'
import {ShikiMagicMovePrecompiled} from '@shikijs/magic-move/react'
import {useCallback, useRef, useState} from 'react'
import '@shikijs/magic-move/style.css'
import {AnimatedTabs} from '@/components/ui/animated-tabs'
import {Badge} from '@/components/ui/badge'
import {HoverCard, HoverCardContent, HoverCardTrigger} from '@/components/ui/hover-card'
import {Select, SelectContent, SelectItem, SelectTrigger} from '@/components/ui/select'
import {CodeBlock} from '@/components/ui/code-block'
import {cleanSnippet, type FrameworkSnippet} from './framework-snippets'
import {
  MAGIC_MOVE_STEP_IDS,
  MAGIC_MOVE_STEPS,
  SNIPPET_TWOSLASH,
  type SnippetCompletion,
  type SnippetHover,
} from './framework-snippets.gen'
import {magicMoveOptions} from './magic-move-options'

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

const activeSnippet = (snippets: FrameworkSnippet[], id: string) =>
  snippets.find((snippet) => snippet.id === id) ?? snippets[0]

function FrameworkSelect({
  snippets,
  active,
  select,
}: {
  snippets: FrameworkSnippet[]
  active: FrameworkSnippet
  select: (id: string) => void
}) {
  return (
    <Select value={active.id} onValueChange={select}>
      <SelectTrigger
        aria-label="Framework"
        className="mb-2 h-11 w-full gap-2 rounded-[10px] border bg-card px-4 font-mono text-[13px] font-semibold sm:hidden"
      >
        <span className="flex items-center gap-2">
          <img src={active.icon} alt="" className="size-[15px]" />
          {active.label}
        </span>
      </SelectTrigger>
      <SelectContent position="popper" className="w-(--radix-select-trigger-width) font-mono text-[13px]">
        {snippets.map((snippet) => (
          <SelectItem key={snippet.id} value={snippet.id} disabled={snippet.soon} className="min-h-11 gap-2 font-mono">
            <span className="flex items-center gap-2">
              <img src={snippet.icon} alt="" className="size-[15px]" />
              {snippet.label}
              {snippet.soon && <Badge variant="secondary">soon</Badge>}
              {snippet.alpha && <Badge variant="outline">alpha</Badge>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function snippetBadge(snippet: FrameworkSnippet) {
  if (snippet.soon) return <Badge variant="secondary">soon</Badge>
  if (snippet.alpha) return <Badge variant="outline">alpha</Badge>
  return undefined
}

const snippetLabel = (snippet: FrameworkSnippet) => snippet.file ?? snippet.label

function frameworkTab(snippet: FrameworkSnippet) {
  return {
    id: snippet.id,
    label: snippet.label,
    disabled: snippet.soon,
    icon: (
      <img
        src={snippet.icon}
        alt=""
        className="size-[15px] opacity-65 grayscale transition-[filter,opacity] duration-150 group-data-[state=active]:opacity-100 group-data-[state=active]:grayscale-0"
      />
    ),
    badge: snippetBadge(snippet),
  }
}

function FrameworkPanel({active}: {active: FrameworkSnippet}) {
  return (
    <TabsPrimitive.Content
      value={active.id}
      className="rounded-[10px] focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
    >
      <CodeBlock filename={snippetLabel(active)} copyText={cleanSnippet(active.code ?? '')} copyLabel="Copy config">
        <Code active={active} />
        <Note active={active} />
      </CodeBlock>
    </TabsPrimitive.Content>
  )
}

export function FrameworkTabs({snippets}: {snippets: FrameworkSnippet[]}) {
  const [activeId, setActiveId] = useState(snippets[0]?.id ?? '')
  const active = activeSnippet(snippets, activeId)
  if (!active) return null

  return (
    <div className="min-w-0">
      <FrameworkSelect snippets={snippets} active={active} select={setActiveId} />
      <AnimatedTabs
        label="Frameworks"
        value={active.id}
        onValueChange={setActiveId}
        listClassName="mb-2 max-sm:hidden"
        tabs={snippets.map(frameworkTab)}
      >
        <FrameworkPanel active={active} />
        {snippets
          .filter((snippet) => snippet.id !== active.id)
          .map((snippet) => (
            <TabsPrimitive.Content key={snippet.id} value={snippet.id} className="hidden" />
          ))}
      </AnimatedTabs>
    </div>
  )
}

const completionFor = (id: string) => SNIPPET_TWOSLASH.find((entry) => entry.id === id)?.completion ?? null

function Code({active}: {active: FrameworkSnippet}) {
  const shouldReduceMotion = useReducedMotion()
  const [anchors, setAnchors] = useState<Anchor[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef(active.id)
  activeIdRef.current = active.id
  const step = Math.max(0, MAGIC_MOVE_STEP_IDS.indexOf(active.id))
  const completion = completionFor(active.id)

  const twoslashRef = useRef(active.twoslash === true)
  twoslashRef.current = active.twoslash === true

  const settle = () => {
    const container = containerRef.current
    if (!container) return
    setAnchors(twoslashRef.current ? measureAnchors(container, activeIdRef.current) : [])
  }
  const settleRef = useRef(settle)
  settleRef.current = settle

  const attach = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el
    if (el && twoslashRef.current) requestAnimationFrame(() => settleRef.current())
  }, [])

  return (
    <div
      ref={attach}
      tabIndex={0}
      role="region"
      aria-label={`${snippetLabel(active)} config`}
      className="od-snippet relative overflow-x-auto px-4 py-3 font-mono text-[13px] leading-[1.7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <ShikiMagicMovePrecompiled
        steps={MAGIC_MOVE_STEPS}
        step={step}
        options={magicMoveOptions(shouldReduceMotion)}
        onStart={() => setAnchors([])}
        onEnd={settle}
      />
      {anchors.map((anchor, index) => (
        <AnchorCard key={index} anchor={anchor} completion={completion} />
      ))}
    </div>
  )
}

function HoverBody({hover}: {hover: SnippetHover}) {
  return (
    <>
      <code className="block overflow-x-auto whitespace-pre" dangerouslySetInnerHTML={{__html: hover.html}} />
      {hover.docs && <p className="mt-2 border-t border-dashed pt-2 font-sans text-muted-foreground">{hover.docs}</p>}
    </>
  )
}

function CompletionList({completion}: {completion: SnippetCompletion}) {
  return (
    <ul className="flex flex-col gap-1">
      {completion.items.map((name) => (
        <li key={name} className="rounded px-2 py-1 first:bg-accent">
          <span className="font-semibold text-primary">{completion.target}</span>
          <span className="text-muted-foreground">{name.slice(completion.target.length)}</span>
        </li>
      ))}
    </ul>
  )
}

function AnchorContent({anchor, completion}: {anchor: Anchor; completion: SnippetCompletion | null}) {
  if (anchor.hover) return <HoverBody hover={anchor.hover} />
  if (completion) return <CompletionList completion={completion} />
  return null
}

function AnchorCard({anchor, completion}: {anchor: Anchor; completion: SnippetCompletion | null}) {
  const isCaret = anchor.caret === true
  return (
    <HoverCard openDelay={150} closeDelay={250}>
      <HoverCardTrigger asChild>
        <span
          className="od-hover-anchor"
          style={{left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height}}
        >
          {isCaret && <span className="od-caret" />}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="od-popup w-auto max-w-[min(440px,80vw)] px-4 py-2 font-mono text-[13px] leading-[1.6]"
      >
        <AnchorContent anchor={anchor} completion={isCaret ? completion : null} />
      </HoverCardContent>
    </HoverCard>
  )
}

function Note({active}: {active: FrameworkSnippet}) {
  if (!active.note) return null
  return (
    <div className="border-t border-dashed px-4 py-2 font-mono text-[13px] text-muted-foreground">{active.note}</div>
  )
}
