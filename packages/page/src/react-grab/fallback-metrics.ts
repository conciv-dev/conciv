const MEASURED_PROPS = [
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-stretch',
  'font-variant',
  'font-feature-settings',
  'font-variation-settings',
  'font-kerning',
  'font-optical-sizing',
  'font-synthesis-weight',
  'font-synthesis-style',
  'word-spacing',
  'text-transform',
]

const EPSILON_PX = 0.5

const PROBE_STEP_PX = 1

export type StyledElement = HTMLElement | SVGElement

export function isStyledElement(node: Node): node is StyledElement {
  return node instanceof HTMLElement || node instanceof SVGElement
}

export type TextRun = {source: StyledElement; clone: StyledElement}

type Candidate = {run: TextRun; base: number; css: string; steppedCss: string; text: string}

type Probe = {live: HTMLElement; fallback: HTMLElement; stepped: HTMLElement}

type Measurer = {doc: Document; close: () => void}

function unquoted(value: string): string {
  return value.trim().replace(/^["']|["']$/g, '')
}

function familiesOf(value: string): string[] {
  return value
    .split(',')
    .map(unquoted)
    .filter((name) => name !== '')
}

function webfontFamilies(): Set<string> {
  const families = new Set<string>()
  document.fonts.forEach((face) => families.add(unquoted(face.family)))
  return families
}

function letterSpacingOf(styles: CSSStyleDeclaration): number {
  const parsed = Number.parseFloat(styles.letterSpacing)
  return Number.isFinite(parsed) ? parsed : 0
}

function measurementCss(styles: CSSStyleDeclaration, letterSpacing: number): string {
  const declarations = MEASURED_PROPS.map((prop) => `${prop}:${styles.getPropertyValue(prop)}`).join(';')
  return `position:absolute;top:0;left:0;white-space:nowrap;visibility:hidden;${declarations};letter-spacing:${letterSpacing}px`
}

function probeSpan(doc: Document, css: string, text: string): HTMLElement {
  const span = doc.createElement('span')
  span.style.cssText = css
  span.textContent = text
  return span
}

async function openMeasurer(): Promise<Measurer | null> {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('tabindex', '-1')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:200px;border:0;visibility:hidden'
  frame.srcdoc = '<!doctype html><html><head></head><body style="margin:0"></body></html>'
  document.body.appendChild(frame)
  await new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), {once: true})
  })
  const doc = frame.contentDocument
  if (!doc) {
    frame.remove()
    return null
  }
  return {doc, close: () => frame.remove()}
}

function candidatesOf(runs: readonly TextRun[]): Candidate[] {
  const webfonts = webfontFamilies()
  return runs.flatMap((run) => {
    const text = run.source.textContent ?? ''
    if (text.trim() === '') return []
    const styles = getComputedStyle(run.source)
    if (!familiesOf(styles.fontFamily).some((family) => webfonts.has(family))) return []
    const base = letterSpacingOf(styles)
    return [
      {
        run,
        base,
        text,
        css: measurementCss(styles, base),
        steppedCss: measurementCss(styles, base + PROBE_STEP_PX),
      },
    ]
  })
}

export async function correctFallbackMetrics(runs: readonly TextRun[]): Promise<void> {
  if (runs.length === 0 || document.fonts.size === 0) return
  const candidates = candidatesOf(runs)
  if (candidates.length === 0) return
  const measurer = await openMeasurer()
  if (!measurer) return
  const hostHolder = document.createElement('div')
  hostHolder.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;overflow:hidden'
  const frameHolder = measurer.doc.createElement('div')
  const probes: Probe[] = candidates.map((candidate) => ({
    live: probeSpan(document, candidate.css, candidate.text),
    fallback: probeSpan(measurer.doc, candidate.css, candidate.text),
    stepped: probeSpan(measurer.doc, candidate.steppedCss, candidate.text),
  }))
  for (const probe of probes) {
    hostHolder.appendChild(probe.live)
    frameHolder.appendChild(probe.fallback)
    frameHolder.appendChild(probe.stepped)
  }
  document.body.appendChild(hostHolder)
  measurer.doc.body.appendChild(frameHolder)
  try {
    const widths = probes.map((probe) => ({
      live: probe.live.getBoundingClientRect().width,
      fallback: probe.fallback.getBoundingClientRect().width,
      stepped: probe.stepped.getBoundingClientRect().width,
    }))
    candidates.forEach((candidate, index) => {
      const measured = widths[index]
      if (!measured) return
      if (Math.abs(measured.live - measured.fallback) < EPSILON_PX) return
      const slots = (measured.stepped - measured.fallback) / PROBE_STEP_PX
      if (slots <= 0) return
      candidate.run.clone.style.letterSpacing = `${candidate.base + (measured.live - measured.fallback) / slots}px`
    })
  } finally {
    hostHolder.remove()
    measurer.close()
  }
}
