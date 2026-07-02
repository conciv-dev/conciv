import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createHighlighter} from 'shiki'
import {createTwoslasher} from 'twoslash'
import {codeToKeyedTokens} from '@shikijs/magic-move/core'
import {cleanSnippet, FRAMEWORK_SNIPPETS} from '../src/components/landing/framework-snippets.ts'

const THEMES = {light: 'github-light', dark: 'github-dark'} as const

const highlighter = await createHighlighter({themes: Object.values(THEMES), langs: ['ts', 'js']})

const withCode = FRAMEWORK_SNIPPETS.flatMap((snippet) =>
  snippet.code === undefined ? [] : [{...snippet, code: snippet.code}],
)

const steps = withCode.map((snippet) =>
  codeToKeyedTokens(highlighter, cleanSnippet(snippet.code), {
    lang: snippet.lang ?? 'ts',
    themes: THEMES,
    defaultColor: 'light',
  }),
)

const inlineHighlight = (code: string) =>
  highlighter
    .codeToHtml(code, {lang: 'ts', themes: THEMES, defaultColor: 'light'})
    .replace(/^<pre[^>]*><code>/, '')
    .replace(/<\/code><\/pre>$/, '')

const twoslasher = createTwoslasher()

const hoverData = withCode.flatMap((snippet) => {
  if (snippet.twoslash !== true) return []
  const result = twoslasher(snippet.code, snippet.lang ?? 'ts')
  const occurrences = new Map<string, number>()
  const hovers = result.nodes.flatMap((node) => {
    if (node.type !== 'hover') return []
    const occurrence = occurrences.get(node.target) ?? 0
    occurrences.set(node.target, occurrence + 1)
    return [
      {
        target: node.target,
        occurrence,
        html: inlineHighlight(node.text),
        docs: node.docs ?? null,
      },
    ]
  })
  const completion = result.nodes.flatMap((node) =>
    node.type !== 'completion'
      ? []
      : [
          {
            target: cleanSnippet(snippet.code).split('\n')[node.line]?.trim() ?? 'h',
            items: node.completions.map((entry) => entry.name),
          },
        ],
  )
  return [{id: snippet.id, hovers, completion: completion[0] ?? null}]
})

const body = [
  "import type {KeyedTokensInfo} from '@shikijs/magic-move/types'",
  '',
  'export type SnippetHover = {target: string; occurrence: number; html: string; docs: string | null}',
  'export type SnippetCompletion = {target: string; items: string[]}',
  'export type SnippetTwoslash = {id: string; hovers: SnippetHover[]; completion: SnippetCompletion | null}',
  '',
  `export const MAGIC_MOVE_STEP_IDS: string[] = ${JSON.stringify(withCode.map((snippet) => snippet.id))}`,
  '',
  `export const MAGIC_MOVE_STEPS: KeyedTokensInfo[] = ${JSON.stringify(steps)}`,
  '',
  `export const SNIPPET_TWOSLASH: SnippetTwoslash[] = ${JSON.stringify(hoverData)}`,
  '',
].join('\n')

const out = fileURLToPath(new URL('../src/components/landing/framework-snippets.gen.ts', import.meta.url))
await writeFile(out, body)
console.log(`wrote ${out} (${steps.length} steps, ${hoverData.length} twoslash)`)
