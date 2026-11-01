import {readFileSync} from 'node:fs'
const PAGE = process.env.PAGE ?? 'dashboard'
const DIR = `raw/${PAGE}`
const data = JSON.parse(readFileSync(`${DIR}/pairs.json`, 'utf8'))
const stage = process.argv[2] ?? 'final'
const st = data.stages[stage]
const nodes = new Map<string, {tag: string; text: string; x: number; y: number; w: number; h: number}>(st.nodes.map((n: {path: string}) => [n.path, n]))
const covers = (b: {x: number; y: number; w: number; h: number}, e: {x: number; y: number; w: number; h: number} | undefined) => { if (!e) return false; const w = Math.min(b.x + b.w, e.x + e.w) - Math.max(b.x, e.x), h = Math.min(b.y + b.h, e.y + e.h) - Math.max(b.y, e.y); return w > 0 && h > 0 && (w * h) / (b.w * b.h) >= 0.6 }
const groups: Record<string, string[]> = {ambiguous: [], abstained: [], wrong: []}
for (const d of data.design) {
  const p = st.pairs[d.id]
  const t = d.truth ? nodes.get(d.truth) : null
  const line = `${d.kind} ${JSON.stringify(d.text ?? '')} box ${[d.box.x, d.box.y, d.box.w, d.box.h].map(Math.round).join(',')} truth ${d.truth} <${t?.tag}> ${JSON.stringify((t?.text ?? '').slice(0, 24))}`
  if (p === 'ambiguous') groups.ambiguous.push(line)
  else if (p === null || p === undefined) groups.abstained.push(line)
  else if (d.truth && p !== d.truth && !((p.startsWith(d.truth + '.') || d.truth.startsWith(p + '.')) && covers(d.box, nodes.get(p)) && covers(d.box, nodes.get(d.truth)))) groups.wrong.push(line + ` -> paired ${p} <${nodes.get(p)?.tag}> ${JSON.stringify((nodes.get(p)?.text ?? '').slice(0, 24))}`)
}
for (const [k, v] of Object.entries(groups)) { console.log(`== ${k} (${v.length})`); for (const l of v.slice(0, 40)) console.log('  ' + l) }
