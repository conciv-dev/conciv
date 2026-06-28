import {createSignal, onCleanup, type JSX} from 'solid-js'
import {createHighlighterCore, type HighlighterCore} from 'shiki/core'
import {createJavaScriptRegexEngine} from 'shiki/engine/javascript'
import ts from 'shiki/langs/typescript.mjs'
import tsx from 'shiki/langs/tsx.mjs'
import js from 'shiki/langs/javascript.mjs'
import jsx from 'shiki/langs/jsx.mjs'
import json from 'shiki/langs/json.mjs'
import cssLang from 'shiki/langs/css.mjs'
import html from 'shiki/langs/html.mjs'
import bash from 'shiki/langs/bash.mjs'
import md from 'shiki/langs/markdown.mjs'
import githubDark from 'shiki/themes/github-dark.mjs'
import githubLight from 'shiki/themes/github-light.mjs'
import {Streamdown} from '@mandarax/solid-streamdown'

// Dual theme: shiki emits the light colors inline + the dark colors as `--shiki-dark` vars on each
// token. tokens.css swaps to the dark vars under .chat-theme-dark / .chat-theme-mandarax, so code
// blocks follow the chat theme instead of being permanently dark.
const THEMES = {light: 'github-light', dark: 'github-dark'} as const

// One async highlighter for the whole package; until ready, code renders as plain <pre>. Ported from
// the widget's markdown.tsx (now deleted) — the single markdown renderer in the running widget.
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
    themes: [githubLight, githubDark],
    langs: [ts, tsx, js, jsx, json, cssLang, html, bash, md],
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

// Streaming markdown via @mandarax/solid-streamdown. Token fade spans are present only while
// streaming; once complete, it re-renders as clean static markup.
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
