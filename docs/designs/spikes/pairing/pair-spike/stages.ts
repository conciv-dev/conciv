import {chromium} from 'playwright'
import {writeFileSync, mkdirSync} from 'node:fs'
const PAGE = process.env.PAGE ?? 'dashboard'
const URL = process.env.URL ?? 'http://localhost:5761/'
const ONLY = (process.env.STAGES ?? '').split(',').filter(Boolean)
const DIR = `raw/${PAGE}`

type Rect = {x: number; y: number; w: number; h: number}
export type Node = {path: string; tag: string; x: number; y: number; w: number; h: number; text: string; ownText: string; bg: string; color: string; fontSize: number; fontWeight: number; lineRects: Rect[]; component: string; key: string; role: string; aria: string; cls: string; axRole: string; axName: string; selectors: string[]}

function collect(): Node[] {
  const rules: {sel: string}[] = []
  for (const sheet of Array.from(document.styleSheets)) { try { for (const r of Array.from(sheet.cssRules)) if (r instanceof CSSStyleRule) rules.push({sel: r.selectorText}) } catch { /* cross-origin sheet */ } }
  const parts = rules.flatMap((r) => r.sel.split(',').map((x) => x.trim())).filter((x) => x && x !== '*')
  const matched = (el: Element) => parts.filter((sel) => { try { return el.matches(sel) } catch { return false } })
  const ax = (el: Element) => { const a = el as Element & {computedRole?: string; computedName?: string}; return {axRole: a.computedRole ?? '', axName: a.computedName ?? ''} }
  const parentOf = (el: Element): {parent: Element | ShadowRoot; shadow: boolean} | null => {
    if (el.parentElement) return {parent: el.parentElement, shadow: false}
    const root = el.getRootNode()
    if (root instanceof ShadowRoot) return {parent: root, shadow: true}
    return null
  }
  const pathOf = (el: Element): string => {
    const parts: string[] = []
    let node: Element = el
    for (;;) {
      const up = parentOf(node)
      if (!up) break
      const idx = Array.prototype.indexOf.call(up.parent.children, node)
      parts.unshift(up.shadow ? `s${idx}` : String(idx))
      if (up.parent instanceof ShadowRoot) { node = up.parent.host; continue }
      node = up.parent
    }
    return parts.join('.')
  }
  const allElements = (root: Element | ShadowRoot): Element[] => Array.from(root.querySelectorAll('*')).flatMap((el) => [el, ...(el.shadowRoot ? allElements(el.shadowRoot) : [])])
  const range = document.createRange()
  const out: Node[] = []
  for (const el of allElements(document.body)) {
    if (el.closest('script,style,noscript,template')) continue
    if (el.tagName.toLowerCase() !== 'svg' && el.closest('svg')) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    const cs = getComputedStyle(el)
    const inlineOnly = Array.from(el.children).every((c) => { const d = getComputedStyle(c).display; return d.startsWith('inline') || d === 'contents' })
    const ownText = Array.from(el.childNodes).filter((t) => t.nodeType === 3).map((t) => t.textContent ?? '').join('').replace(/\s+/g, ' ').trim()
    const field = el as HTMLInputElement
    const text = (inlineOnly ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : ownText) || (typeof field.placeholder === 'string' ? field.placeholder : '') || (typeof field.value === 'string' && el.tagName.toLowerCase() === 'input' ? field.value : '')
    const lineRects: Rect[] = []
    if (inlineOnly && text) {
      range.selectNodeContents(el)
      for (const lr of Array.from(range.getClientRects())) {
        if (lr.width === 0 || lr.height === 0) continue
        const same = lineRects.find((q) => Math.abs(q.y - (lr.top + scrollY)) < Math.max(2, q.h * 0.3))
        if (same) { const right = Math.max(same.x + same.w, lr.right + scrollX); const bottom = Math.max(same.y + same.h, lr.bottom + scrollY); same.x = Math.min(same.x, lr.left + scrollX); same.y = Math.min(same.y, lr.top + scrollY); same.w = right - same.x; same.h = bottom - same.y; continue }
        lineRects.push({x: lr.left + scrollX, y: lr.top + scrollY, w: lr.width, h: lr.height})
      }
    }
    const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
    const fiber = fiberKey ? (el as unknown as Record<string, {key: string | null; return: unknown; type: unknown}>)[fiberKey] : undefined
    const nearest = (f: {key: string | null; return: unknown; type: unknown} | undefined): {component: string; key: string} => {
      const key = f?.key ?? ''
      let cur = f
      while (cur) { const t = cur.type as {name?: string} | string | null; if (typeof t === 'function' && t.name) return {component: t.name, key}; cur = cur.return as typeof cur }
      return {component: '', key}
    }
    const src = nearest(fiber)
    const a = ax(el)
    ;(el as Element & {__pzIndex?: number}).__pzIndex = out.length
    out.push({axRole: a.axRole, axName: a.axName, selectors: matched(el), component: src.component, key: src.key, role: el.getAttribute('role') ?? '', aria: el.getAttribute('aria-label') ?? el.getAttribute('alt') ?? el.getAttribute('title') ?? '', cls: el.getAttribute('class') ?? '', path: pathOf(el), tag: el.tagName.toLowerCase(), x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, text, ownText, bg: cs.backgroundColor, color: cs.color, fontSize: parseFloat(cs.fontSize), fontWeight: parseInt(cs.fontWeight, 10), lineRects})
  }
  return out
}

const STAGES: Record<string, {css?: string; js?: () => void}> = {
  final: {},
  empty: {js: () => { const main = document.querySelector('main'); if (main) main.innerHTML = ''; const nav = document.querySelector('nav'); if (nav) nav.innerHTML = '' }},
  skeleton: {js: () => { const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const nodes: Text[] = []; while (walker.nextNode()) nodes.push(walker.currentNode as Text); for (const t of nodes) if (t.textContent?.trim()) t.textContent = ' ' }},
  sampledata: {js: () => {
    const words = ['lorem', 'ipsum', 'dolor', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'tempor', 'incididunt', 'labore', 'magna', 'aliqua', 'veniam', 'quis', 'nostrud', 'ullamco', 'laboris', 'nisi', 'aliquip']
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const nodes: Text[] = []; while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    let i = 0
    for (const t of nodes) { const s = t.textContent ?? ''; if (!s.trim()) continue; t.textContent = s.replace(/[A-Za-z]+/g, (m) => { const w = words[i++ % words.length]; return (w + w + w).slice(0, Math.max(2, Math.min(m.length, 12))) }).replace(/\d/g, (d) => String((Number(d) + 3) % 10)) }
  }},
  layout: {css: 'div, section, header, nav, aside, main, table, thead, tbody, tr, td, th, button, ul, li { display: block !important; width: auto !important; position: static !important }'},
  sizes: {css: 'body { font-size: 1.3em !important } .kpi, .panel, .header, td, th, button, .nav a { padding: 24px !important } h1, h2, .kpi-value { font-size: 2em !important }'},
}

const browser = await chromium.launch()
const page = await browser.newPage({viewport: {width: 1280, height: 800}, deviceScaleFactor: 1, reducedMotion: 'reduce'})
mkdirSync(DIR, {recursive: true})
for (const [name, stage] of Object.entries(STAGES).filter(([n]) => !ONLY.length || ONLY.includes(n))) {
  await page.goto(URL, {waitUntil: 'networkidle'})
  await page.addStyleTag({content: '*, *::before, *::after { animation: none !important; transition: none !important } [data-conciv-root] { display: none !important }'})
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(500)
  await page.evaluate(() => scrollTo(0, 0))
  await page.evaluate(() => document.fonts.ready)
  if (stage.css) await page.addStyleTag({content: stage.css})
  if (stage.js) await page.evaluate(stage.js)
  await page.waitForTimeout(200)
  const nodes = await page.evaluate(collect)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Accessibility.enable')
  type DomNode = {backendNodeId: number; nodeType: number; children?: DomNode[]; contentDocument?: DomNode}
  const {root} = await cdp.send('DOM.getDocument', {depth: -1}) as {root: DomNode}
  const pathByBackend = new Map<number, string>()
  const walk = (n: DomNode, path: number[]) => {
    const kids = (n.children ?? []).filter((c) => c.nodeType === 1)
    kids.forEach((c, i) => { const p = [...path, i]; pathByBackend.set(c.backendNodeId, p.join('.')); walk(c, p) })
  }
  const html = (root.children ?? []).find((c) => c.nodeType === 1)
  if (html) { pathByBackend.set(html.backendNodeId, ''); walk(html, []) }
  const {nodes: axNodes} = await cdp.send('Accessibility.getFullAXTree') as {nodes: {backendDOMNodeId?: number; role?: {value: string}; name?: {value: string}; ignored: boolean}[]}
  const byPath = new Map(nodes.map((n) => [n.path, n]))
  for (const a of axNodes) {
    if (a.ignored || a.backendDOMNodeId === undefined) continue
    const p = pathByBackend.get(a.backendDOMNodeId)
    const n = p === undefined ? undefined : byPath.get(p)
    if (!n) continue
    n.axRole = a.role?.value ?? ''
    n.axName = a.name?.value ?? ''
  }
  await cdp.detach()
  await page.screenshot({path: `${DIR}/stage-${name}.png`, fullPage: true})
  writeFileSync(`${DIR}/stage-${name}.json`, JSON.stringify(nodes))
  console.log(name, nodes.length, 'nodes', nodes.filter((n) => n.text).length, 'with text')
}
await browser.close()
