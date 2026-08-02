import {createSignal, onCleanup, type JSX} from 'solid-js'
import {createHighlighterCore, type HighlighterCore} from 'shiki/core'
import {createJavaScriptRegexEngine} from 'shiki/engine/javascript'
import {Streamdown} from '@conciv/solid-streamdown'

const THEMES = {light: 'github-light', dark: 'github-dark'} as const

const store: {highlighter: HighlighterCore | null; started: boolean; listeners: Set<() => void>} = {
  highlighter: null,
  started: false,
  listeners: new Set(),
}

function subscribe(onChange: () => void): () => void {
  store.listeners.add(onChange)
  ensureHighlighter()
  return () => store.listeners.delete(onChange)
}

function ensureHighlighter(): void {
  if (store.started) return
  store.started = true
  void createHighlighterCore({
    themes: [() => import('shiki/themes/github-light.mjs'), () => import('shiki/themes/github-dark.mjs')],
    langs: [
      () => import('shiki/langs/typescript.mjs'),
      () => import('shiki/langs/tsx.mjs'),
      () => import('shiki/langs/javascript.mjs'),
      () => import('shiki/langs/jsx.mjs'),
      () => import('shiki/langs/json.mjs'),
      () => import('shiki/langs/css.mjs'),
      () => import('shiki/langs/html.mjs'),
      () => import('shiki/langs/bash.mjs'),
      () => import('shiki/langs/markdown.mjs'),
    ],
    engine: createJavaScriptRegexEngine(),
  }).then((highlighter) => {
    store.highlighter = highlighter
    store.listeners.forEach((listener) => listener())
  })
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function codeBlock(code: string, lang: string | undefined, highlighter: HighlighterCore | null): string {
  if (!highlighter) return `<pre><code>${escapeHtml(code)}</code></pre>`
  const requested = (lang ?? '').trim().toLowerCase()
  const language = highlighter.getLoadedLanguages().includes(requested) ? requested : 'text'
  return highlighter.codeToHtml(code, {lang: language, themes: THEMES, defaultColor: 'light'})
}

export type MarkdownProps = {content: string; streaming?: boolean}

export function Markdown(props: MarkdownProps): JSX.Element {
  const [highlighter, setHighlighter] = createSignal<HighlighterCore | null>(store.highlighter)
  onCleanup(subscribe(() => setHighlighter(() => store.highlighter)))
  const highlightCode = (code: string, lang: string | undefined): string => codeBlock(code, lang, highlighter())
  return (
    <Streamdown
      class="prose-pw"
      isAnimating={props.streaming === true}
      caret={props.streaming ? 'block' : false}
      highlightCode={highlightCode}
    >
      {props.content}
    </Streamdown>
  )
}
