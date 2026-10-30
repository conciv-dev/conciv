import {readFile} from 'node:fs/promises'
import {isAbsolute, join, relative} from 'node:path'
import postcss, {AtRule, type Container, type Document, type Root} from 'postcss'
import {declares} from '../../shared/properties.js'
import type {CssMap} from '../../shared/types.js'

export type CssEntry = {
  file: string
  line: number
  column: number
  selector: string
  media: string[]
  prop: string
  value: string
}

type Parent = Container | Document | undefined

function mediaOf(parent: Parent): string[] {
  if (parent === undefined || parent.type === 'root' || parent.type === 'document') return []
  const outer = mediaOf(parent.parent)
  if (!(parent instanceof AtRule) || parent.name !== 'media') return outer
  return [...outer, `@media ${parent.params}`]
}

async function parseCss(path: string): Promise<Root | null> {
  const css = await readFile(path, 'utf8').catch(() => null)
  if (css === null) return null
  try {
    return postcss.parse(css, {from: path})
  } catch {
    return null
  }
}

function entriesOf(input: {root: Root; file: string}): CssEntry[] {
  const entries: CssEntry[] = []
  input.root.walkDecls((decl) => {
    const {parent} = decl
    const start = decl.source?.start
    if (parent?.type !== 'rule' || start === undefined) return
    for (const selector of parent.selectors) {
      entries.push({
        file: input.file,
        line: start.line,
        column: start.column,
        selector: selector.trim(),
        media: mediaOf(parent.parent),
        prop: decl.prop,
        value: decl.value,
      })
    }
  })
  return entries
}

function localName(selector: string): string | null {
  if (!selector.startsWith('._')) return null
  const local = selector.split('_')[1]
  if (local === undefined || local === '') return null
  return `.${local}`
}

function selects(input: {entry: CssEntry; selector: string}): boolean {
  if (input.entry.selector === input.selector) return true
  return input.entry.file.endsWith('.module.css') && input.entry.selector === localName(input.selector)
}

export async function buildCssMap(input: {cwd: string; files: string[]}): Promise<CssMap> {
  const parsed = await Promise.all(
    input.files.map(async (file) => {
      const path = isAbsolute(file) ? file : join(input.cwd, file)
      const root = await parseCss(path)
      if (root === null) return []
      return entriesOf({root, file: relative(input.cwd, path)})
    }),
  )
  const entries = parsed.flat()
  return {
    find: ({selector, property}) => {
      const hit = entries.findLast((entry) => selects({entry, selector}) && declares({declared: entry.prop, property}))
      if (hit === undefined) return null
      return {file: hit.file, line: hit.line, column: hit.column, declaration: `${hit.prop}: ${hit.value}`}
    },
  }
}

export async function declarationsOf(input: {cwd: string; file: string; selector: string}): Promise<number> {
  const root = await parseCss(join(input.cwd, input.file))
  if (root === null) return 0
  const counts: number[] = []
  root.walkRules((rule) => {
    if (!rule.selectors.some((selector) => selector.trim() === input.selector)) return
    counts.push(rule.nodes.filter((node) => node.type === 'decl').length)
  })
  return counts.reduce((sum, count) => sum + count, 0)
}
