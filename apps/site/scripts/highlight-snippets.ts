import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {codeToHtml} from 'shiki'
import {transformerTwoslash} from '@shikijs/twoslash'
import {FRAMEWORK_SNIPPETS} from '../src/components/landing/framework-snippets.ts'

const THEMES = {light: 'github-light', dark: 'github-dark'} as const

const highlight = (code: string, lang: 'ts' | 'js', twoslash: boolean) =>
  codeToHtml(code, {
    lang,
    themes: THEMES,
    defaultColor: 'light',
    transformers: twoslash ? [transformerTwoslash()] : [],
  })

const entries = await Promise.all(
  FRAMEWORK_SNIPPETS.flatMap((snippet) =>
    snippet.code === undefined
      ? []
      : [
          highlight(snippet.code, snippet.lang ?? 'ts', snippet.twoslash === true).then(
            (html) => [snippet.id, html] as const,
          ),
        ],
  ),
)

const body = `export const HIGHLIGHTED_SNIPPETS: Record<string, string> = ${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`
const out = fileURLToPath(new URL('../src/components/landing/framework-snippets.gen.ts', import.meta.url))
await writeFile(out, body)
console.log(`wrote ${out} (${entries.length} snippets)`)
