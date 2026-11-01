import {chromium} from 'playwright'
import {writeFileSync} from 'node:fs'

const [name, url, outDir] = process.argv.slice(2)
const widths = Array.from({length: 57}, (_, i) => 320 + i * 20)

type Text = {text: string; font: string; letterSpacing: number; lineHeight: number; whiteSpace: string; mixed: boolean}
type Rect = {x: number; y: number; w: number; h: number}
type El = {path: string; tag: string; x: number; y: number; w: number; h: number; lines: number; pad: [number, number, number, number]; txt?: Text; lineRects?: Rect[]}

function readGeometry(): El[] {
  const pathOf = (el: Element): string => {
    const parts: number[] = []
    let node: Element | null = el
    while (node && node.parentElement) {
      parts.unshift(Array.prototype.indexOf.call(node.parentElement.children, node))
      node = node.parentElement
    }
    return parts.join('.')
  }
  const range = document.createRange()
  const out: El[] = []
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    if (el.closest('script,style,noscript,template,[data-conciv-root]')) continue
    if (el.tagName.toLowerCase() !== 'svg' && el.closest('svg')) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    const cs = getComputedStyle(el)
    const tops = new Set<number>()
    const rects: Rect[] = []
    const parts: string[] = []
    let mixed = false
    for (const t of Array.from(el.childNodes)) {
      if (t.nodeType === 1) { if ((t.textContent ?? '').trim()) mixed = true; continue }
      if (t.nodeType !== 3 || !(t.textContent ?? '').trim()) continue
      parts.push(t.textContent ?? '')
      range.selectNodeContents(t)
      for (const lr of Array.from(range.getClientRects())) {
        if (lr.width === 0) continue
        tops.add(Math.round(lr.top))
        const same = rects.find((q) => Math.abs(q.y - (lr.top + scrollY)) < 2)
        if (same) { const right = Math.max(same.x + same.w, lr.right + scrollX); same.x = Math.min(same.x, lr.left + scrollX); same.w = right - same.x; continue }
        rects.push({x: lr.left + scrollX, y: lr.top + scrollY, w: lr.width, h: lr.height})
      }
    }
    const px = (v: string) => parseFloat(v) || 0
    const pad: [number, number, number, number] = [px(cs.paddingTop) + px(cs.borderTopWidth), px(cs.paddingRight) + px(cs.borderRightWidth), px(cs.paddingBottom) + px(cs.borderBottomWidth), px(cs.paddingLeft) + px(cs.borderLeftWidth)]
    const row: El = {path: pathOf(el), tag: el.tagName.toLowerCase(), x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, lines: tops.size, pad}
    const inlineOnly = Array.from(el.children).every((c) => { const d = getComputedStyle(c).display; return d.startsWith('inline') || d === 'contents' })
    if (inlineOnly && (el.textContent ?? '').trim()) {
      const whole: Rect[] = []
      range.selectNodeContents(el)
      for (const lr of Array.from(range.getClientRects())) {
        if (lr.width === 0 || lr.height === 0) continue
        const same = whole.find((q) => Math.abs(q.y - (lr.top + scrollY)) < Math.max(2, q.h * 0.3))
        if (same) { const right = Math.max(same.x + same.w, lr.right + scrollX); const bottom = Math.max(same.y + same.h, lr.bottom + scrollY); same.x = Math.min(same.x, lr.left + scrollX); same.y = Math.min(same.y, lr.top + scrollY); same.w = right - same.x; same.h = bottom - same.y; continue }
        whole.push({x: lr.left + scrollX, y: lr.top + scrollY, w: lr.width, h: lr.height})
      }
      if (whole.length) row.lineRects = whole
    } else if (rects.length) row.lineRects = rects
    if (parts.length) {
      const lh = cs.lineHeight === 'normal' ? (tops.size ? (r.height - pad[0] - pad[2]) / tops.size : px(cs.fontSize) * 1.2) : px(cs.lineHeight)
      row.txt = {text: parts.join('').replace(/\s+/g, ' ').trim(), font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, letterSpacing: px(cs.letterSpacing), lineHeight: lh, whiteSpace: cs.whiteSpace, mixed}
    }
    out.push(row)
  }
  return out
}

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1280, height: 800}, reducedMotion: 'reduce'})
await page.goto(url, {waitUntil: 'networkidle'})
await page.evaluate(() => document.fonts.ready)
await page.addStyleTag({content: '[data-conciv-root]{display:none !important} *,*::before,*::after{animation-play-state:paused !important;transition:none !important}'})
const byWidth: Record<number, El[]> = {}
for (const w of widths) {
  await page.setViewportSize({width: w, height: 800})
  await page.waitForTimeout(150)
  byWidth[w] = await page.evaluate(readGeometry)
  await page.screenshot({path: `png/shots/${name}-${w}.png`, fullPage: true, animations: 'disabled'})
  process.stdout.write(`${w}:${byWidth[w].length} `)
}
writeFileSync(`${outDir}/${name}-truth.json`, JSON.stringify({name, url, widths, byWidth}))
await browser.close()
console.log('\nwrote', name)
