import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import postcss from '/Users/dev/Public/web/aidx/.claude/worktrees/unocss-shadow-spike/node_modules/.pnpm/postcss@8.4.31/node_modules/postcss/lib/postcss.mjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const cssPath = path.join(dir, '../src/styles.css')

const srcDir = path.join(dir, '../src')
const tsxFiles = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, {withFileTypes: true})) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) tsxFiles.push(p)
  }
}
walk(srcDir)
const live = new Set()
for (const f of tsxFiles) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/pw-[a-z0-9-]+/g)) live.add(m[0])
}

const LIVE_PREFIXES = []
const isLive = (c) => live.has(c) || LIVE_PREFIXES.some((p) => c.startsWith(p))
const classesIn = (selector) => [...selector.matchAll(/\.(pw-[a-z0-9-]+)/g)].map((m) => m[1])
const isDeadRule = (rule) => {
  const classes = classesIn(rule.selector)
  if (classes.length === 0) return false
  return classes.every((c) => !isLive(c))
}

const root = postcss.parse(fs.readFileSync(cssPath, 'utf8'))
let removed = 0
root.walkRules((rule) => {
  if (rule.parent && rule.parent.type === 'atrule' && rule.parent.name === 'keyframes') return
  if (isDeadRule(rule)) {
    rule.remove()
    removed++
  }
})

root.walkAtRules('media', (at) => {
  if (at.nodes && at.nodes.length === 0) at.remove()
})

fs.writeFileSync(cssPath, root.toString())
console.log(`pruned ${removed} dead rules; styles.css now ${root.toString().split('\n').length} lines`)
