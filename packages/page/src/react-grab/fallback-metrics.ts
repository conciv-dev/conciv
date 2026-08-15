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

export type TextRun = {source: HTMLElement; clone: HTMLElement}

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

function measure(doc: Document, css: string, text: string): number {
  const span = doc.createElement('span')
  span.style.cssText = css
  span.textContent = text
  doc.body.appendChild(span)
  const width = span.getBoundingClientRect().width
  span.remove()
  return width
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

function correctionFor(measurer: Measurer, run: TextRun, text: string): number | null {
  const styles = getComputedStyle(run.source)
  if (!familiesOf(styles.fontFamily).some((family) => webfontFamilies().has(family))) return null
  const base = letterSpacingOf(styles)
  const css = measurementCss(styles, base)
  const live = measure(document, css, text)
  const fallback = measure(measurer.doc, css, text)
  if (Math.abs(live - fallback) < EPSILON_PX) return null
  const stepped = measure(measurer.doc, measurementCss(styles, base + PROBE_STEP_PX), text)
  const slots = (stepped - fallback) / PROBE_STEP_PX
  if (slots <= 0) return null
  return base + (live - fallback) / slots
}

export async function correctFallbackMetrics(runs: readonly TextRun[]): Promise<void> {
  if (runs.length === 0 || document.fonts.size === 0) return
  const measurer = await openMeasurer()
  if (!measurer) return
  try {
    for (const run of runs) {
      const text = run.source.textContent ?? ''
      if (text.trim() === '') continue
      const corrected = correctionFor(measurer, run, text)
      if (corrected === null) continue
      run.clone.style.letterSpacing = `${corrected}px`
    }
  } finally {
    measurer.close()
  }
}
