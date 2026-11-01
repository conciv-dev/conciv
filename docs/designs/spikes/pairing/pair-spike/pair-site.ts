import {readFileSync} from 'node:fs'
import {pairDesigns, loadDesign as loadDesignD} from './pair-design.ts'

type Box = {x: number; y: number; w: number; h: number}
type DNode = {id: number; kind: 'text' | 'frame'; box: Box; text?: string; fill?: number[]; parent: number | null}
type Dom = {path: string; tag: string; x: number; y: number; w: number; h: number; lineRects: Box[]; txt?: {text: string; font: string}}
const INTERP = '/private/tmp/claude-501/-Users-omrikatz-Public-web-mono/1371b864-cc6b-48a6-823b-ade1fe762a3e/scratchpad/interp-spike'
const NAME = process.env.PAGE ?? 'site'
const truthAll = JSON.parse(readFileSync(`${INTERP}/raw/${NAME}-truth.json`, 'utf8')) as {byWidth: Record<string, Dom[]>}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const bigrams = (s: string) => { const o = new Set<string>(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o }
const lev = (a: string, b: string) => { const m = a.length, n = b.length; const d = Array.from({length: m + 1}, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n] }
const dice = (a: string, b: string) => { if (!a || !b) return 0; if (a === b) return 1; if (a.length < 4 || b.length < 4) return Math.max(0, 1 - lev(a, b) / Math.max(a.length, b.length)); const A = bigrams(a), B = bigrams(b); let n = 0; for (const g of A) if (B.has(g)) n++; return 2 * n / (A.size + B.size) }
const iou = (a: Box, b: Box) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (w <= 0 || h <= 0) return 0; const i = w * h; return i / (a.w * a.h + b.w * b.h - i) }
const inside = (r: Box, e: Box) => { const w = Math.min(r.x + r.w, e.x + e.w) - Math.max(r.x, e.x), h = Math.min(r.y + r.h, e.y + e.h) - Math.max(r.y, e.y); return w <= 0 || h <= 0 ? 0 : (w * h) / (r.w * r.h) }
const fontPx = (f: string | undefined) => { const m = f?.match(/(\d+(?:\.\d+)?)px/); return m ? Number(m[1]) : 0 }
const WORDS = ['lorem', 'ipsum', 'dolor', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'tempor', 'incididunt', 'labore', 'magna', 'aliqua', 'veniam', 'quis', 'nostrud']
const lorem = (s: string, seed: {i: number}) => s.replace(/[A-Za-z]+/g, (m) => { const w = WORDS[seed.i++ % WORDS.length]; return (w + w + w).slice(0, Math.max(2, Math.min(m.length, 12))) }).replace(/\d/g, (d) => String((Number(d) + 3) % 10))

function loadDesign(w: number) {
  const d = JSON.parse(readFileSync(`${INTERP}/png/${NAME}-design-${w}.json`, 'utf8')) as {width: number; height: number; text: {text: string; box: Box}[]; frames: {box: Box; fill?: number[]}[]}
  const frames: DNode[] = d.frames.map((f, i) => ({id: i, kind: 'frame', box: f.box, fill: f.fill, parent: null}))
  const texts: DNode[] = d.text.filter((t) => norm(t.text).length > 0).map((t, i) => ({id: frames.length + i, kind: 'text', box: t.box, text: t.text, parent: null}))
  const all = [...frames, ...texts]
  for (const n of all) { const ps = frames.filter((f) => f !== n && inside(n.box, f.box) >= 0.9 && f.box.w * f.box.h > n.box.w * n.box.h).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h); n.parent = ps[0]?.id ?? null }
  const dom = truthAll.byWidth[String(w)].filter((e) => e.w > 0 || e.h > 0 || e.lineRects?.length)
  const truth = new Map<number, string | null>()
  for (const n of all) {
    if (n.kind === 'text') {
      let best: Dom | null = null, bs = 0
      for (const e of dom) for (const lr of e.lineRects ?? []) { const s = iou(n.box, lr); if (s > bs) { bs = s; best = e } }
      if (best && bs >= 0.3) { truth.set(n.id, best.path); continue }
      const host = dom.filter((e) => inside(n.box, e) >= 0.8 && e.w < 600 && e.h < 400).sort((a, b) => a.w * a.h - b.w * b.h)[0]
      truth.set(n.id, host?.path ?? null)
    } else { let best: Dom | null = null, bs = 0; for (const e of dom) { const s = iou(n.box, e); if (s > bs) { bs = s; best = e } } truth.set(n.id, best && bs >= 0.6 ? best.path : null) }
  }
  return {w, all, truth, dom, width: d.width, height: d.height}
}

type Kind = 'heading' | 'label' | 'body' | 'control' | 'cell' | 'container' | 'media'
const designKind = (n: DNode): Kind => n.kind === 'frame' ? (n.box.w * n.box.h < 3600 ? 'media' : 'container') : n.box.h >= 26 ? 'heading' : n.box.h <= 13 ? 'label' : 'body'
const domKind = (e: Dom): Kind => { const t = e.tag; if (/^h[1-6]$/.test(t)) return 'heading'; if (t === 'button' || t === 'a' || t === 'input' || t === 'select') return 'control'; if (t === 'td' || t === 'th') return 'cell'; if (t === 'img' || t === 'svg' || t === 'canvas' || t === 'video') return 'media'; const fs = fontPx(e.txt?.font); if (e.txt?.text) return fs >= 20 ? 'heading' : fs <= 12 ? 'label' : 'body'; return 'container' }
const KIND_OK: Record<Kind, Kind[]> = {heading: ['heading', 'body', 'cell', 'control'], label: ['label', 'body', 'cell', 'control', 'heading'], body: ['body', 'label', 'heading', 'cell', 'control'], control: ['control'], cell: ['cell'], container: ['container', 'control', 'cell'], media: ['media', 'control', 'container']}

type Hint = Map<number, Map<string, number>>
function pairSite(D: ReturnType<typeof loadDesign>, dom: Dom[], hint: Hint | null, hintOnly: boolean) {
  const pairs = new Map<number, string | 'ambiguous' | null>()
  const conf = new Map<number, number>()
  const byId = new Map(D.all.map((n) => [n.id, n])), byPath = new Map(dom.map((e) => [e.path, e]))
  const uses = new Map<string, number>()
  const capacity = (kind: 'text' | 'frame', e: Dom) => kind === 'text' ? Math.max(1, e.lineRects?.length ?? 1) : 1
  const taken: Record<'text' | 'frame', Set<string>> = {text: new Set(), frame: new Set()}
  const take = (kind: 'text' | 'frame', e: Dom) => { const n = (uses.get(kind + e.path) ?? 0) + 1; uses.set(kind + e.path, n); if (n >= capacity(kind, e)) taken[kind].add(e.path) }
  const diag = Math.hypot(D.width, D.height)
  const W = [0.3, 0.1, 0.2, 0.1, 0.2, 0.2]
  const VOTERS = W.length
  const scale: number[] = Array(VOTERS).fill(1)
  const ancestor = (n: DNode): DNode | null => { let cur = n.parent === null ? null : byId.get(n.parent) ?? null; while (cur) { if (typeof pairs.get(cur.id) === 'string') return cur; cur = cur.parent === null ? null : byId.get(cur.parent) ?? null } return null }
  const depthOf = (p: string) => p.split('.').length
  const redundant = (e: Dom) => { const kids = dom.filter((c) => c.path.startsWith(e.path + '.') && depthOf(c.path) === depthOf(e.path) + 1); if (kids.length !== 1) return false; const k = kids[0]; return (k.txt?.text === e.txt?.text && !!e.txt?.text) || iou(e, k) >= 0.9 }
  const score = (d: DNode) => {
    const anc = ancestor(d)
    const parentPath = anc === null ? null : pairs.get(anc.id) as string
    const parentNode = parentPath ? byPath.get(parentPath) : undefined
    const dk = designKind(d)
    const glyph = d.kind === 'text' && norm(d.text ?? '').length <= 1 && d.box.h < 14
    const sizeOk = (e: Dom) => { const ratio = (e.w * e.h) / (d.box.w * d.box.h); return ratio > 1 / 3 && ratio < 3 && iou(d.box, e) >= 0.3 }
    const cands = dom.filter((e) => !taken[d.kind].has(e.path) && !redundant(e) && (d.kind === 'text' ? !!e.txt?.text : sizeOk(e) && !(/^(h[1-6]|p|span|td|th|label|b|i|em|strong)$/.test(e.tag))))
    const rel = (y: number, top: number, hh: number) => hh > 0 ? Math.min(1, Math.max(0, (y - top) / hh)) : 0.5
    return cands.map((e) => {
      const text = d.kind === 'text' && !glyph ? dice(norm(d.text ?? ''), norm(e.txt?.text ?? '')) : null
      const kind = KIND_OK[dk].includes(domKind(e)) ? (KIND_OK[dk][0] === domKind(e) ? 1 : 0.6) : 0
      const structural = parentPath ? (e.path.startsWith(parentPath + '.') ? 1 : 0) : 0.5
      const order = parentNode && anc ? 1 - Math.abs(rel(e.y + e.h / 2, parentNode.y, parentNode.h) - rel(d.box.y + d.box.h / 2, anc.box.y, anc.box.h)) : 0.5
      const fs = fontPx(e.txt?.font)
      const style = d.kind === 'frame' ? 0.5 : fs ? 1 - Math.min(1, Math.abs(d.box.h - 0.72 * fs) / (0.5 * d.box.h)) : 0.3
      const ink = d.kind === 'text' && e.lineRects?.length ? e.lineRects.reduce((a, r) => ({x: Math.min(a.x, r.x), y: Math.min(a.y, r.y), w: Math.max(a.x + a.w, r.x + r.w) - Math.min(a.x, r.x), h: Math.max(a.y + a.h, r.y + r.h) - Math.min(a.y, r.y)})) : {x: e.x, y: e.y, w: e.w, h: e.h}
      const dist = Math.hypot(0.5 * (d.box.x + d.box.w / 2 - ink.x - ink.w / 2), d.box.y + d.box.h / 2 - ink.y - ink.h / 2)
      const geometry = 0.4 * (1 - Math.min(1, dist / (diag * 0.25))) + 0.6 * (1 - Math.min(1, dist / 40))
      const h = hint?.get(d.id)
      const twin = h && h.size ? (h.has(e.path) ? h.get(e.path)! : (hintOnly ? 0 : null)) : null
      const votes: (number | null)[] = [text, kind, 0.6 * structural + 0.4 * order, style, hintOnly ? null : geometry, twin]
      const used = votes.map((v, i) => [W[i] * scale[i], v] as const).filter((v): v is readonly [number, number] => v[1] !== null)
      const total = used.reduce((s, [w, v]) => s + w * v, 0) / Math.max(1e-6, used.reduce((s, [w]) => s + w, 0))
      return {e, total, votes}
    }).sort((a, b) => b.total - a.total)
  }
  const ordered = [...D.all.filter((n) => n.kind === 'frame').sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h), ...D.all.filter((n) => n.kind === 'text')]
  const agree = Array(VOTERS).fill(0), seen = Array(VOTERS).fill(0)
  for (const d of ordered) { const sc = score(d); if (sc.length < 2) continue; for (let i = 0; i < VOTERS; i++) { const r = sc.filter((c) => c.votes[i] !== null).sort((a, b) => (b.votes[i] ?? 0) - (a.votes[i] ?? 0)); if (r.length < 2 || (r[0].votes[i] ?? 0) - (r[1].votes[i] ?? 0) < 0.05) continue; seen[i]++; if (r[0].e.path === sc[0].e.path) agree[i]++ } }
  for (let i = 0; i < VOTERS; i++) scale[i] = seen[i] >= 5 ? Math.max(0.1, agree[i] / seen[i]) : 0.5
  const pending = new Set(ordered.map((n) => n.id))
  while (pending.size) {
    const best = [...pending].map((id) => { const d = byId.get(id)!; const sc = score(d); return {d, sc, top: sc[0]?.total ?? 0, gap: sc.length > 1 ? sc[0].total - sc[1].total : 1} }).sort((a, b) => (b.top + b.gap) - (a.top + a.gap))[0]
    pending.delete(best.d.id)
    const exact = best.sc.filter((c) => c.votes[0] === 1)
    if (exact.length === 1 && scale[0] >= 0.5) { pairs.set(best.d.id, exact[0].e.path); conf.set(best.d.id, 1); take(best.d.kind, exact[0].e); continue }
    const totals = best.sc.map((c) => c.total).sort((a, b) => a - b); const median = totals[Math.floor(totals.length / 2)] ?? 0
    if (!best.sc.length || best.top < 0.3 || (best.sc.length > 2 && best.top < median + 0.1)) { pairs.set(best.d.id, null); continue }
    const dominated = best.sc.length < 2 || best.sc[1].votes.every((v, i) => { const w = best.sc[0].votes[i]; return scale[i] < 0.3 || v === null || w === null || w >= v - 0.05 })
    if (best.gap < 0.08 && !dominated) { pairs.set(best.d.id, 'ambiguous'); continue }
    pairs.set(best.d.id, best.sc[0].e.path); conf.set(best.d.id, Math.min(1, best.top + best.gap)); take(best.d.kind, best.sc[0].e)
  }
  return {pairs, scale, conf}
}

function twinsBetween(A: ReturnType<typeof loadDesign>, B: ReturnType<typeof loadDesign>): Map<number, number> {
  const {pairs} = pairDesigns(loadDesignD(A.w), loadDesignD(B.w))
  const out = new Map<number, number>()
  for (const [a, b] of pairs) if (typeof b === 'number') out.set(a, b)
  return out
}

const target = Number(process.env.TARGET ?? 400)
const sources = (process.env.SOURCES ?? '1280,780').split(',').map(Number)
const T = loadDesign(target)
const S = sources.map((w) => loadDesign(w))
const seed = {i: 0}
const loremDom = (dom: Dom[]) => dom.map((e) => e.txt ? {...e, txt: {...e.txt, text: lorem(e.txt.text, seed)}} : e)
const shiftDom = (dom: Dom[]) => dom.map((e, i) => { const dy = 60 * Math.sin(i * 0.7), dx = 30 * Math.cos(i * 1.3); return {...e, x: e.x + dx, y: e.y + dy, lineRects: (e.lineRects ?? []).map((r) => ({...r, x: r.x + dx, y: r.y + dy}))} })
const twinsAll = S.map((Sd) => twinsBetween(T, Sd))
console.log(`design ${target}: ${T.all.length} nodes; twins per source: ${twinsAll.map((m) => m.size).join(', ')}`)
console.log('| DOM condition | mode | correct | wrong | ambiguous | abstained (truth exists) | abstained (no truth) |\n|---|---|---|---|---|---|---|')
const conditions: [string, (d: Dom[]) => Dom[]][] = [['real', (d) => d], ['lorem', loremDom], ['shifted', shiftDom], ['lorem + shifted', (d) => shiftDom(loremDom(d))]]
for (const [cond, f] of conditions) {
  const dom = f(T.dom)
  const hint: Hint = new Map()
  S.forEach((Sd, si) => {
    const {pairs: sp, conf} = pairSite(Sd, f(Sd.dom), null, false)
    for (const [tid, sid] of twinsAll[si]) { const p = sp.get(sid); if (typeof p !== 'string') continue; const m = hint.get(tid) ?? new Map<string, number>(); m.set(p, Math.min(1, (m.get(p) ?? 0) + (conf.get(sid) ?? 0.5) / S.length)); hint.set(tid, m) }
  })
  const modes: [string, Hint | null, boolean][] = [['A direct', null, false], ['B twins only', hint, true], ['C both', hint, false]]
  for (const [mode, h, hintOnly] of modes) {
    const {pairs} = pairSite(T, dom, h, hintOnly)
    const c = {correct: 0, wrong: 0, amb: 0, absT: 0, absN: 0}
    for (const n of T.all) {
      const t = T.truth.get(n.id) ?? null; const p = pairs.get(n.id) ?? null
      if (p === 'ambiguous') { c.amb++; continue }
      if (p === null) { if (t) c.absT++; else c.absN++; continue }
      const same = p === t || (t !== null && (p.startsWith(t + '.') || t.startsWith(p + '.')) && inside(n.box, T.dom.find((e) => e.path === p) ?? {x: 0, y: 0, w: 0, h: 0}) >= 0.8 && inside(n.box, T.dom.find((e) => e.path === t) ?? {x: 0, y: 0, w: 0, h: 0}) >= 0.8)
      if (same) c.correct++; else c.wrong++
    }
    console.log(`| ${cond} | ${mode} | ${c.correct} | ${c.wrong} | ${c.amb} | ${c.absT} | ${c.absN} |`)
  }
}
