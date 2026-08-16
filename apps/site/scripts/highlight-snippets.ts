import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createHighlighter} from 'shiki'
import {createTwoslasher} from 'twoslash'
import {codeToKeyedTokens} from '@shikijs/magic-move/core'
import {cleanSnippet, FRAMEWORK_SNIPPETS} from '../src/components/landing/framework-snippets.ts'
import {INSTALL_COMMANDS} from '../src/lib/package-installer-store.ts'

const THEMES = {light: 'github-light-high-contrast', dark: 'github-dark'} as const

const highlighter = await createHighlighter({themes: Object.values(THEMES), langs: ['ts', 'js', 'swift', 'sh']})

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

const installSteps = INSTALL_COMMANDS.map((entry) =>
  codeToKeyedTokens(highlighter, entry.command, {lang: 'sh', themes: THEMES, defaultColor: 'light'}),
)

const inlineTokens = (code: string) =>
  highlighter.codeToTokens(code, {lang: 'ts', themes: THEMES, defaultColor: 'light'}).tokens.map((line) =>
    line.map((token) => ({
      content: token.content,
      color: token.htmlStyle?.color,
      darkColor: token.htmlStyle?.['--shiki-dark'],
    })),
  )

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
        tokens: inlineTokens(node.text),
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
  'export type SnippetToken = {content: string; color?: string; darkColor?: string}',
  'export type SnippetHover = {target: string; occurrence: number; tokens: SnippetToken[][]; docs: string | null}',
  'export type SnippetCompletion = {target: string; items: string[]}',
  'export type SnippetTwoslash = {id: string; hovers: SnippetHover[]; completion: SnippetCompletion | null}',
  '',
  `export const MAGIC_MOVE_STEP_IDS: string[] = ${JSON.stringify(withCode.map((snippet) => snippet.id))}`,
  '',
  `export const MAGIC_MOVE_STEPS: KeyedTokensInfo[] = ${JSON.stringify(steps)}`,
  '',
  `export const SNIPPET_TWOSLASH: SnippetTwoslash[] = ${JSON.stringify(hoverData)}`,
  '',
  `export const INSTALL_COMMAND_STEP_IDS: string[] = ${JSON.stringify(INSTALL_COMMANDS.map((entry) => entry.id))}`,
  '',
  `export const INSTALL_COMMAND_STEPS: KeyedTokensInfo[] = ${JSON.stringify(installSteps)}`,
  '',
].join('\n')

const out = fileURLToPath(new URL('../src/components/landing/framework-snippets.gen.ts', import.meta.url))
await writeFile(out, body)
console.log(`wrote ${out} (${steps.length} steps, ${hoverData.length} twoslash)`)
