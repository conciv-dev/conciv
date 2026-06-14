import {createMemo, createSignal, onCleanup, type JSX} from 'solid-js'
import {Marked} from 'marked'
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

const THEME = 'github-dark'

// One async highlighter for the whole widget; until ready, code renders as plain <pre>.
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
    themes: [githubDark],
    langs: [ts, tsx, js, jsx, json, cssLang, html, bash, md],
    engine: createJavaScriptRegexEngine(),
  }).then((hl) => {
    store.highlighter = hl
    store.listeners.forEach((l) => l())
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function codeBlock(code: string, lang: string | undefined, hl: HighlighterCore | null): string {
  if (!hl) return `<pre class="pw-md-pre"><code>${escapeHtml(code)}</code></pre>`
  const requested = (lang ?? '').trim().toLowerCase()
  const language = hl.getLoadedLanguages().includes(requested) ? requested : 'text'
  return hl.codeToHtml(code, {lang: language, theme: THEME})
}

// marked's `code` renderer is registered once; the active highlighter is threaded via this box.
const activeHl: {current: HighlighterCore | null} = {current: null}
const marked = new Marked({gfm: true, breaks: true})
marked.use({
  renderer: {
    code(token) {
      return codeBlock(token.text, token.lang, activeHl.current)
    },
  },
})

function render(text: string, hl: HighlighterCore | null): string {
  activeHl.current = hl
  return marked.parse(text, {async: false})
}

// Re-renders as text streams in and once the highlighter becomes ready.
export function Markdown(props: {text: string}): JSX.Element {
  const [hl, setHl] = createSignal<HighlighterCore | null>(store.highlighter)
  onCleanup(subscribe(() => setHl(() => store.highlighter)))
  const rendered = createMemo(() => render(props.text, hl()))
  return <div class="pw-md" innerHTML={rendered()} />
}
