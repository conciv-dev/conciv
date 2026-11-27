import {createHighlighterCore, type HighlighterCore} from 'shiki/core'
import {createJavaScriptRawEngine, createJavaScriptRegexEngine} from 'shiki/engine/javascript'
import type {HastElement} from '@conciv/solid-streamdown'
import {warmupLanguages, type MainToWorkerMessage, type WorkerToMainMessage} from './highlight-shared.js'
import {CODE_THEME_NAME, concivCodeTheme} from '../theme/code-theme-tokens.js'

type Highlighters = {precompiled: HighlighterCore | null; regex: HighlighterCore | null}

function post(message: WorkerToMainMessage): void {
  postMessage(message)
}

function resolveHighlighter(highlighters: Highlighters, requested: string): HighlighterCore | null {
  if (highlighters.regex && highlighters.regex.getLoadedLanguages().includes(requested)) return highlighters.regex
  if (highlighters.precompiled && highlighters.precompiled.getLoadedLanguages().includes(requested))
    return highlighters.precompiled
  return null
}

function highlightedPre(highlighters: Highlighters, message: MainToWorkerMessage): HastElement | null {
  const highlighter = resolveHighlighter(highlighters, message.lang)
  if (!highlighter) return null
  const root = highlighter.codeToHast(message.code, {lang: message.lang, theme: CODE_THEME_NAME})
  const pre = root.children[0]
  return pre?.type === 'element' ? pre : null
}

function startHighlightWorker(): void {
  const highlighters: Highlighters = {precompiled: null, regex: null}

  void createHighlighterCore({
    themes: [concivCodeTheme()],
    langs: [
      () => import('@shikijs/langs-precompiled/typescript'),
      () => import('@shikijs/langs-precompiled/tsx'),
      () => import('@shikijs/langs-precompiled/javascript'),
      () => import('@shikijs/langs-precompiled/jsx'),
      () => import('@shikijs/langs-precompiled/json'),
      () => import('@shikijs/langs-precompiled/css'),
      () => import('@shikijs/langs-precompiled/html'),
      () => import('@shikijs/langs-precompiled/markdown'),
      () => import('@shikijs/langs-precompiled/scss'),
      () => import('@shikijs/langs-precompiled/yaml'),
      () => import('@shikijs/langs-precompiled/diff'),
      () => import('@shikijs/langs-precompiled/sql'),
      () => import('@shikijs/langs-precompiled/python'),
      () => import('@shikijs/langs-precompiled/go'),
      () => import('@shikijs/langs-precompiled/rust'),
    ],
    engine: createJavaScriptRawEngine(),
  })
    .then((highlighter) => {
      highlighters.precompiled = highlighter
      post({type: 'ready', core: 'precompiled', languages: highlighter.getLoadedLanguages()})
      warmupLanguages(highlighter)
    })
    .catch(() => {
      highlighters.precompiled = null
    })

  void createHighlighterCore({
    themes: [concivCodeTheme()],
    langs: [() => import('shiki/langs/bash.mjs')],
    engine: createJavaScriptRegexEngine(),
  })
    .then((highlighter) => {
      highlighters.regex = highlighter
      post({type: 'ready', core: 'regex', languages: highlighter.getLoadedLanguages()})
      warmupLanguages(highlighter)
    })
    .catch(() => {
      highlighters.regex = null
    })

  self.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
    post({type: 'result', id: event.data.id, pre: highlightedPre(highlighters, event.data)})
  })
}

startHighlightWorker()
