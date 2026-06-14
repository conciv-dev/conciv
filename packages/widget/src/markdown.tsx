import {type JSX, useMemo, useSyncExternalStore} from 'react'
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

// Streaming markdown for the chat. marked turns the (possibly partial) text into HTML;
// fenced code is highlighted by Shiki using the pure-JS regex engine (no wasm asset to
// fetch — the widget is a single shadow-DOM <script>). Shiki emits inline styles, so
// highlighting survives the shadow boundary with no external stylesheet.

const THEME = 'github-dark'

// One async highlighter for the whole widget, kept in a tiny external store so React
// components can subscribe to its readiness via useSyncExternalStore (an external-sync
// primitive, not useEffect). Until it resolves, code renders as plain <pre>; the store
// notifies when it's ready so in-flight messages re-render highlighted.
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

function getSnapshot(): HighlighterCore | null {
  return store.highlighter
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

// marked's `code` renderer is registered once, so the active highlighter is threaded through
// this box that render() sets just before parsing — keeps the renderer a stable closure.
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

export function Markdown(props: {text: string}): JSX.Element {
  // Re-renders as the text streams in and once the highlighter becomes ready.
  const highlighter = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const rendered = useMemo(() => render(props.text, highlighter), [props.text, highlighter])
  return <div className="pw-md" dangerouslySetInnerHTML={{__html: rendered}} />
}
