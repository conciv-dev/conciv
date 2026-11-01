import {readFileSync, writeFileSync} from 'node:fs'
import type {Node} from './stages.ts'
import {PNG} from 'pngjs'
const PAGE = process.env.PAGE ?? 'dashboard'
const DIR = `raw/${PAGE}`

const loadPng = (f: string) => PNG.sync.read(readFileSync(f))
const designPng = loadPng(`${DIR}/stage-final.png`)
const ahash = (png: PNG, b: Box): number[] => {
  const out: number[] = []
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) {
    const x0 = Math.floor(b.x + (gx * b.w) / 8), x1 = Math.max(x0 + 1, Math.floor(b.x + ((gx + 1) * b.w) / 8)), y0 = Math.floor(b.y + (gy * b.h) / 8), y1 = Math.max(y0 + 1, Math.floor(b.y + ((gy + 1) * b.h) / 8))
    let sum = 0, n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue; const i = (y * png.width + x) * 4; sum += (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; n++ }
    out.push(n ? sum / n : 0)
  }
  const mean = out.reduce((a, b) => a + b, 0) / out.length
  return out.map((v) => (v > mean ? 1 : 0))
}
const pixelScore = (a: number[], b: number[]) => 1 - a.reduce((s, v, i) => s + (v === b[i] ? 0 : 1), 0) / a.length
const HINTS: Record<string, string[]> = {control: ['btn', 'button', 'page', 'nav', 'input', 'search', 'link', 'tab'], media: ['logo', 'icon', 'avatar', 'img', 'chart', 'bar'], label: ['badge', 'tag', 'pill', 'status', 'chip'], heading: ['title', 'heading', 'h1', 'h2'], cell: ['cell', 'td', 'row'], container: ['panel', 'card', 'kpi', 'section', 'wrap', 'header', 'sidebar', 'table'], body: ['text', 'value', 'label', 'desc']}
const AX_KIND: Record<string, Kind> = {button: 'control', link: 'control', textbox: 'control', searchbox: 'control', combobox: 'control', checkbox: 'control', heading: 'heading', cell: 'cell', gridcell: 'cell', columnheader: 'cell', rowheader: 'cell', img: 'media', image: 'media', figure: 'media', graphics_document: 'media'}
const axScore = (e: Node, dk: Kind) => { const k = AX_KIND[e.axRole]; if (!k) return null; return k === dk ? 1 : KIND_OK[dk].includes(k) ? 0.6 : 0 }
const sourceHint = (e: Node, dk: Kind) => { const tokens = `${e.cls} ${e.component} ${e.role} ${e.aria} ${e.selectors.join(' ')}`.toLowerCase(); if (!tokens.trim()) return null; const hit = (k: string) => HINTS[k].some((t) => tokens.includes(t)); if (hit(dk)) return 1; return Object.keys(HINTS).some(hit) ? 0.2 : null }

type Box = {x: number; y: number; w: number; h: number}
type DesignNode = {id: number; kind: 'text' | 'frame'; box: Box; text?: string; fill?: number[]; parent: number | null; order: number}
const design = JSON.parse(readFileSync(`${DIR}/design.json`, 'utf8')) as {width: number; height: number; text: {text: string; box: Box}[]; frames: {kind: string; box: Box; fill?: number[]}[]}
const STAGES = (process.env.STAGES ?? 'final,empty,skeleton,sampledata,layout,sizes').split(',')
const stages = Object.fromEntries([...new Set(['final', ...STAGES])].map((s) => [s, JSON.parse(readFileSync(`${DIR}/stage-${s}.json`, 'utf8')) as Node[]]))

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const bigrams = (s: string) => { const o = new Set<string>(); for (let i = 0; i < s.length - 1; i++) o.add(s.slice(i, i + 2)); return o }
const lev = (a: string, b: string) => { const m = a.length, n = b.length; const d = Array.from({length: m + 1}, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n] }
const dice = (a: string, b: string) => { if (!a || !b) return 0; if (a === b) return 1; if (a.length < 4 || b.length < 4) return Math.max(0, 1 - lev(a, b) / Math.max(a.length, b.length)); const A = bigrams(a), B = bigrams(b); let n = 0; for (const g of A) if (B.has(g)) n++; return 2 * n / (A.size + B.size) }
const iou = (a: Box, b: Box) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); if (w <= 0 || h <= 0) return 0; const i = w * h; return i / (a.w * a.h + b.w * b.h - i) }
const inside = (r: Box, e: Box) => { const w = Math.min(r.x + r.w, e.x + e.w) - Math.max(r.x, e.x), h = Math.min(r.y + r.h, e.y + e.h) - Math.max(r.y, e.y); return w <= 0 || h <= 0 ? 0 : (w * h) / (r.w * r.h) }
const parsePx = (c: string) => { const m = c.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null }

const frames: DesignNode[] = design.frames.map((f, i) => ({id: i, kind: 'frame', box: f.box, fill: f.fill, parent: null, order: 0}))
const texts: DesignNode[] = design.text.filter((t) => norm(t.text).length > 0).map((t, i) => ({id: frames.length + i, kind: 'text', box: t.box, text: t.text, parent: null, order: 0}))
const all = [...frames, ...texts]
for (const n of all) {
  const parents = frames.filter((f) => f !== n && inside(n.box, f.box) >= 0.9 && f.box.w * f.box.h > n.box.w * n.box.h).sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)
  n.parent = parents[0]?.id ?? null
}
for (const n of all) { const sibs = all.filter((m) => m.parent === n.parent && m.kind === n.kind).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x); n.order = sibs.indexOf(n) / Math.max(1, sibs.length - 1) }

type Kind = 'heading' | 'label' | 'body' | 'control' | 'cell' | 'container' | 'media'
function designKind(n: DesignNode): Kind { if (n.kind === 'frame') return n.box.w * n.box.h < 60 * 60 ? 'media' : 'container'; if (n.box.h >= 26) return 'heading'; if (n.box.h <= 13) return 'label'; return 'body' }
function domKind(e: Node): Kind { const t = e.tag; if (/^h[1-6]$/.test(t)) return 'heading'; if (t === 'button' || t === 'a' || t === 'input' || t === 'select') return 'control'; if (t === 'td' || t === 'th') return 'cell'; if (t === 'img' || t === 'svg' || t === 'canvas') return 'media'; if (e.text) return e.fontSize >= 20 ? 'heading' : e.fontSize <= 12 ? 'label' : 'body'; return 'container' }
const KIND_OK: Record<Kind, Kind[]> = {heading: ['heading', 'body', 'cell', 'control'], label: ['label', 'body', 'cell', 'control', 'heading'], body: ['body', 'label', 'heading', 'cell', 'control'], control: ['control'], cell: ['cell'], container: ['container', 'control', 'cell'], media: ['media', 'control', 'container']}

type Pairing = Map<number, string | 'ambiguous' | null>
type Weights = {text: number; kind: number; structure: number; style: number; geometry: number; pixel: number; source: number; a11y: number}
function pair(nodes: Node[], weights: Weights, margin: number, stagePng: PNG): {pairs: Pairing; scores: Map<number, number>} {
  const byPath = new Map(nodes.map((n) => [n.path, n]))
  const childrenOf = new Map<string, Node[]>()
  for (const n of nodes) { const i = n.path.lastIndexOf('.'); if (i < 0) continue; const parent = n.path.slice(0, i); const list = childrenOf.get(parent) ?? []; list.push(n); childrenOf.set(parent, list) }
  const redundantSet = new Set<string>()
  for (const e of nodes) { const kids = childrenOf.get(e.path) ?? []; if (kids.length !== 1) continue; const k = kids[0]; if ((k.text === e.text && e.text.length > 0) || iou({x: e.x, y: e.y, w: e.w, h: e.h}, {x: k.x, y: k.y, w: k.w, h: k.h}) >= 0.9) redundantSet.add(e.path) }
  const pairs: Pairing = new Map()
  const scores = new Map<number, number>()
  const diag = Math.hypot(design.width, design.height)
  const hashCache = new Map<string, number[]>()
  const candHash = (e: Node) => { const h = hashCache.get(e.path); if (h) return h; const v = ahash(stagePng, {x: e.x, y: e.y, w: e.w, h: e.h}); hashCache.set(e.path, v); return v }
  const designHash = new Map<number, number[]>()
  const ordered = [...frames.sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h).reverse(), ...texts]
  const takenBy: Record<'text' | 'frame', Set<string>> = {text: new Set(), frame: new Set()}
  const uses = new Map<string, number>()
  const take = (kind: 'text' | 'frame', e: Node) => { const n = (uses.get(kind + e.path) ?? 0) + 1; uses.set(kind + e.path, n); if (n >= (kind === 'text' ? Math.max(1, e.lineRects.length) : 1)) takenBy[kind].add(e.path) }
  const byId = new Map(ordered.map((d) => [d.id, d]))
  const VOTERS = 8
  const scale: number[] = Array(VOTERS).fill(1)
  let calibrating = true
  const scoreAll = (d: DesignNode) => {
    const dk = designKind(d)
    const ancestor = (n: DesignNode): DesignNode | null => { let cur = n.parent === null ? null : byId.get(n.parent) ?? null; while (cur) { const pp = pairs.get(cur.id); if (typeof pp === 'string') return cur; cur = cur.parent === null ? null : byId.get(cur.parent) ?? null } return null }
    const anc = ancestor(d)
    const parentPath = anc === null ? null : pairs.get(anc.id)
    const painted = (e: Node) => { const c = parsePx(e.bg); return (c !== null && !/rgba\(0, 0, 0, 0\)/.test(e.bg)) || /^(button|input|select|img|svg|canvas|a)$/.test(e.tag) }
    const taken = takenBy[d.kind]
    const redundant = (e: Node) => redundantSet.has(e.path)
    const glyph = d.kind === 'text' && norm(d.text ?? '').length <= 1 && d.box.h < 14
    const sizeOk = (e: Node) => { const ratio = (e.w * e.h) / (d.box.w * d.box.h); const cap = glyph ? 8 : 3; return ratio > 1 / cap && ratio < cap && (glyph ? inside(d.box, {x: e.x, y: e.y, w: e.w, h: e.h}) >= 0.5 : iou(d.box, {x: e.x, y: e.y, w: e.w, h: e.h}) >= 0.3) }
    const contains = (e: Node) => inside(d.box, {x: e.x, y: e.y, w: e.w, h: e.h}) >= 0.6
    const open = (e: Node) => !taken.has(e.path) || (d.kind === 'text' && contains(e))
    const coverOk = (e: Node) => calibrating || scale[5] < 0.6 || glyph || contains(e)
    const cands = nodes.filter((e) => open(e) && !redundant(e) && (d.kind === 'text' ? (e.text.length > 0 && coverOk(e)) || (/^(svg|img)$/.test(e.tag) && inside(d.box, {x: e.x, y: e.y, w: e.w, h: e.h}) >= 0.5 && e.w * e.h < 40 * d.box.w * d.box.h) : sizeOk(e) && (painted(e) || !(/^(h[1-6]|p|span|td|th|label|b|i|em|strong)$/.test(e.tag)))))
    const bestText = d.kind === 'text' && !glyph ? Math.max(0, ...cands.filter((e) => e.text && !/^(svg|img)$/.test(e.tag)).map((e) => dice(norm(d.text ?? ''), norm(e.text)))) : 0
    const dHash = designHash.get(d.id) ?? ahash(designPng, d.box)
    designHash.set(d.id, dHash)
    return cands.map((e) => {
      const media = /^(svg|img)$/.test(e.tag)
      const textScore = d.kind === 'text' && !glyph ? (media ? 1 - bestText : e.text ? dice(norm(d.text ?? ''), norm(e.text)) : 0) : 0
      const kindScore = KIND_OK[dk].includes(domKind(e)) ? (KIND_OK[dk][0] === domKind(e) ? 1 : 0.6) : d.kind === 'text' && media ? 0.4 : 0
      const structural = typeof parentPath === 'string' ? (e.path.startsWith(parentPath + '.') ? 1 : 0) : 0.5
      const parentNode = typeof parentPath === 'string' ? byPath.get(parentPath) : undefined
      const parentDesign = anc
      const rel = (y: number, top: number, h: number) => h > 0 ? Math.min(1, Math.max(0, (y - top) / h)) : 0.5
      const orderScore = parentNode && parentDesign ? 1 - Math.abs(rel(e.y + e.h / 2, parentNode.y, parentNode.h) - rel(d.box.y + d.box.h / 2, parentDesign.box.y, parentDesign.box.h)) : 0.5
      const fill = d.fill && parsePx(e.bg)
      const styleScore = d.kind === 'frame' ? (fill ? 1 - Math.min(1, Math.hypot(fill[0] - d.fill![0], fill[1] - d.fill![1], fill[2] - d.fill![2]) / 120) : 0.3) : (d.box.h > 0 && e.fontSize ? 1 - Math.min(1, Math.abs(d.box.h - 0.72 * e.fontSize) / (0.5 * d.box.h)) : 0.3)
      const dc = {x: d.box.x + d.box.w / 2, y: d.box.y + d.box.h / 2}
      const ink = d.kind === 'text' && e.lineRects.length ? e.lineRects.reduce((a, r) => Math.hypot(r.x + r.w / 2 - dc.x, r.y + r.h / 2 - dc.y) < Math.hypot(a.x + a.w / 2 - dc.x, a.y + a.h / 2 - dc.y) ? r : a) : {x: e.x, y: e.y, w: e.w, h: e.h}
      const dist = Math.hypot(0.5 * (d.box.x + d.box.w / 2 - ink.x - ink.w / 2), d.box.y + d.box.h / 2 - ink.y - ink.h / 2)
      const geom = 1 - Math.min(1, dist / (diag * 0.25))
      const local = 1 - Math.min(1, dist / 40)
      const shape = d.kind === 'frame' ? (iou(d.box, {x: e.x, y: e.y, w: e.w, h: e.h}) > 0.5 ? 1 : 1 - Math.min(1, Math.abs(Math.log((d.box.w / d.box.h) / (e.w / e.h))))) : media ? 1 : Math.min(1, inside(d.box, ink) / 0.6)
      const pixel = d.box.w >= 8 && d.box.h >= 8 && e.w >= 8 && e.h >= 8 ? pixelScore(dHash, candHash(e)) : null
      const source = sourceHint(e, dk)
      const a11y = axScore(e, dk)
      const votes: [number, number | null][] = [[weights.a11y, a11y], [weights.text, d.kind === 'text' && !glyph ? textScore : null], [weights.kind, kindScore], [weights.structure, 0.6 * structural + 0.4 * orderScore], [weights.style, styleScore * shape], [weights.geometry, 0.4 * geom + 0.6 * local], [weights.pixel, pixel], [weights.source, source]]
      const used = votes.map(([w, v], i) => [w * scale[i], v] as [number, number | null]).filter((v): v is [number, number] => v[1] !== null)
      const total = used.reduce((s, [w, v]) => s + w * v, 0) / Math.max(1e-6, used.reduce((s, [w]) => s + w, 0))
      return {e, total, votes: votes.map(([, v]) => v)}
    }).sort((a, b) => b.total - a.total)
  }
  const debugIds = new Set((process.env.DEBUG_ID ?? '').split(',').filter(Boolean).map(Number))
  const agree = Array(VOTERS).fill(0), seen = Array(VOTERS).fill(0)
  for (const d of ordered) {
    const sc = scoreAll(d)
    if (sc.length < 2) continue
    for (let i = 0; i < VOTERS; i++) {
      const ranked = sc.filter((c) => c.votes[i] !== null).sort((a, b) => (b.votes[i] ?? 0) - (a.votes[i] ?? 0))
      if (ranked.length < 2 || (ranked[0].votes[i] ?? 0) - (ranked[1].votes[i] ?? 0) < 0.05) continue
      seen[i]++
      if (ranked[0].e.path === sc[0].e.path) agree[i]++
    }
  }
  for (let i = 0; i < VOTERS; i++) scale[i] = seen[i] >= 5 ? Math.max(0.1, agree[i] / seen[i]) : 0.5
  calibrating = false
  if (process.env.DEBUG_SCALE) console.log('scale', scale.map((v) => v.toFixed(2)).join(' '), 'seen', seen.join(' '))
  const pending = new Set(ordered.map((d) => d.id))
  const cache = new Map<number, ReturnType<typeof scoreAll>>()
  const descendants = (id: number) => ordered.filter((d) => { let cur = d.parent; while (cur !== null) { if (cur === id) return true; cur = byId.get(cur)?.parent ?? null } return false })
  const fresh = (d: DesignNode) => { const c = cache.get(d.id); if (c) return c.filter((x) => !takenBy[d.kind].has(x.e.path)); const sc = scoreAll(d); cache.set(d.id, sc); return sc }
  while (pending.size) {
    const best = [...pending].map((id) => { const d = byId.get(id)!; const sc = fresh(d); return {d, sc, top: sc[0]?.total ?? 0, gap: sc.length > 1 ? sc[0].total - sc[1].total : 1} }).sort((a, b) => (b.top + b.gap) - (a.top + a.gap))[0]
    pending.delete(best.d.id)
    if (best.d.kind === 'frame') for (const k of descendants(best.d.id)) cache.delete(k.id)
    if (debugIds.has(best.d.id) && nodes === stages[process.env.DEBUG_STAGE ?? 'final']) console.log('debug', best.d.id, best.d.text ?? 'frame', best.d.box, best.sc.slice(0, 3).map((c) => `${c.e.path} <${c.e.tag}> "${c.e.text.slice(0, 12)}" ${c.total.toFixed(3)} votes ${c.votes.map((v) => v === null ? '-' : v.toFixed(2)).join(' ')}`))
    const exact = best.sc.filter((c) => c.votes[1] === 1)
    if (exact.length === 1 && scale[1] >= 0.5) { pairs.set(best.d.id, exact[0].e.path); scores.set(best.d.id, exact[0].total); take(best.d.kind, exact[0].e); continue }
    const totals = best.sc.map((c) => c.total).sort((a, b) => a - b)
    const median = totals[Math.floor(totals.length / 2)] ?? 0
    if (!best.sc.length || best.top < 0.3 || (best.sc.length > 2 && best.top < median + 0.1)) { pairs.set(best.d.id, null); continue }
    const losesNowhere = best.sc.length < 2 || best.sc[1].votes.every((v, i) => { const w = best.sc[0].votes[i]; return scale[i] < 0.3 || v === null || w === null || w >= v - 0.05 })
    const winsSomewhere = best.sc.length < 2 || best.sc[1].votes.some((v, i) => { const w = best.sc[0].votes[i]; return scale[i] >= 0.3 && v !== null && w !== null && w >= v + 0.15 })
    const dominated = losesNowhere && winsSomewhere
    if (best.gap < margin && !dominated) { pairs.set(best.d.id, 'ambiguous'); scores.set(best.d.id, best.top); continue }
    pairs.set(best.d.id, best.sc[0].e.path); scores.set(best.d.id, best.top); take(best.d.kind, best.sc[0].e)
  }
  return {pairs, scores}
}

const finalNodes = stages.final
const truth = new Map<number, string | null>()
for (const d of all) {
  if (d.kind === 'text') {
    let best: {path: string} | null = null, bs = 0
    for (const e of finalNodes) for (const lr of e.lineRects) { const s = iou(d.box, lr); if (s > bs) { bs = s; best = e } }
    if (best && bs >= 0.3) { truth.set(d.id, best.path); continue }
    const host = finalNodes.filter((e) => inside(d.box, e) >= 0.8 && e.w < 600 && e.h < 400).sort((a, b) => a.w * a.h - b.w * b.h)[0]
    truth.set(d.id, host?.path ?? null)
  } else {
    let best: Node | null = null, bs = 0
    for (const e of finalNodes) { const s = iou(d.box, e); if (s > bs) { bs = s; best = e } }
    truth.set(d.id, best && bs >= 0.6 ? best.path : null)
  }
}
for (const [id, t] of truth) { if (!t) continue; let cur = t; for (;;) { const kids = finalNodes.filter((c) => c.path.startsWith(cur + '.') && c.path.split('.').length === cur.split('.').length + 1); const self = finalNodes.find((n) => n.path === cur); if (!self || kids.length !== 1) break; const k = kids[0]; if (!((k.text === self.text && self.text.length > 0) || iou(self, k) >= 0.9)) break; cur = k.path } truth.set(id, cur) }
console.log('truth pairs', [...truth.values()].filter(Boolean).length, '/', all.length)

const WEIGHTS: Weights = {text: 0.3, kind: 0.1, structure: 0.2, style: 0.1, geometry: 0.2, pixel: 0.1, source: 0.1, a11y: 0.1}
const out: Record<string, unknown> = {design: all.map((d) => ({id: d.id, kind: d.kind, box: d.box, text: d.text, truth: truth.get(d.id) ?? null})), stages: {}}
const rows: string[] = ['| stage | design nodes | truth exists | correct | wrong | ambiguous | abstained (node missing) | abstained (node present) | false pair when missing |', '|---|---|---|---|---|---|---|---|---|']
for (const s of STAGES) {
  const nodes = stages[s]
  const nodeMap = new Map(nodes.map((n) => [n.path, n]))
  const present = new Set(nodes.filter((n) => n.w > 0 || n.h > 0).map((n) => n.path))
  const {pairs} = pair(nodes, WEIGHTS, 0.08, loadPng(`${DIR}/stage-${s}.png`))
  const c = {exists: 0, correct: 0, wrong: 0, amb: 0, absMissing: 0, absPresent: 0, falseMissing: 0}
  for (const d of all) {
    const t = truth.get(d.id) ?? null
    if (!t) continue
    c.exists++
    const p = pairs.get(d.id) ?? null
    const exists = present.has(t) && (s !== 'skeleton' || d.kind === 'frame') && !(s === 'empty' && !nodes.find((n) => n.path === t))
    if (p === 'ambiguous') { c.amb++; continue }
    if (p === null) { if (exists) c.absPresent++; else c.absMissing++; continue }
    if (!exists) { c.falseMissing++; continue }
    const same = p === t || ((p.startsWith(t + '.') || t.startsWith(p + '.')) && inside(d.box, nodeMap.get(p) ?? {x: 0, y: 0, w: 0, h: 0}) >= 0.6 && inside(d.box, nodeMap.get(t) ?? {x: 0, y: 0, w: 0, h: 0}) >= 0.6)
    if (same) c.correct++; else c.wrong++
  }
  ;(out.stages as Record<string, unknown>)[s] = {nodes: nodes.map(({path, tag, x, y, w, h, text}) => ({path, tag, x, y, w, h, text})), pairs: Object.fromEntries([...pairs].map(([id, p]) => [id, p])), present: [...present]}
  rows.push(`| ${s} | ${all.length} | ${c.exists} | ${c.correct} | ${c.wrong} | ${c.amb} | ${c.absMissing} | ${c.absPresent} | ${c.falseMissing} |`)
}
console.log(rows.join('\n'))
writeFileSync(`${DIR}/pairs.json`, JSON.stringify(out))
writeFileSync('results.md', ['# Pairing across development stages', '', `Design = finished dashboard PNG at 1280 (tiled OCR + segmentation): ${texts.length} text runs, ${frames.length} frames. Truth pair = the DOM element the node sits on in the finished page. Pairer = weighted vote (text ${WEIGHTS.text}, kind ${WEIGHTS.kind}, structure ${WEIGHTS.structure}, style ${WEIGHTS.style}, geometry ${WEIGHTS.geometry}, pixel ${WEIGHTS.pixel}, source ${WEIGHTS.source}, a11y ${WEIGHTS.a11y}; renormalised over voters that apply), margin 0.08, floor 0.45.`, '', ...rows].join('\n'))
