import {createHighlighterCore, type HighlighterCore} from 'shiki/core'
import {createJavaScriptRawEngine, createJavaScriptRegexEngine} from 'shiki/engine/javascript'
import {THEMES, warmupLanguages, type MainToWorkerMessage, type WorkerToMainMessage} from './highlight-shared.js'

let precompiledHighlighter: HighlighterCore | null = null
let regexHighlighter: HighlighterCore | null = null

function post(message: WorkerToMainMessage): void {
  postMessage(message)
}

function resolveHighlighter(requested: string): HighlighterCore | null {
  if (regexHighlighter && regexHighlighter.getLoadedLanguages().includes(requested)) return regexHighlighter
  if (precompiledHighlighter && precompiledHighlighter.getLoadedLanguages().includes(requested))
    return precompiledHighlighter
  return null
}

function handleHighlightRequest(message: MainToWorkerMessage): void {
  const highlighter = resolveHighlighter(message.lang)
  if (!highlighter) return
  const html = highlighter.codeToHtml(message.code, {lang: message.lang, themes: THEMES, defaultColor: 'light'})
  post({type: 'result', id: message.id, html})
}

void createHighlighterCore({
  themes: [() => import('shiki/themes/github-light.mjs'), () => import('shiki/themes/github-dark.mjs')],
  langs: [
    () => import('@shikijs/langs-precompiled/typescript'),
    () => import('@shikijs/langs-precompiled/tsx'),
    () => import('@shikijs/langs-precompiled/javascript'),
    () => import('@shikijs/langs-precompiled/jsx'),
    () => import('@shikijs/langs-precompiled/json'),
    () => import('@shikijs/langs-precompiled/css'),
    () => import('@shikijs/langs-precompiled/html'),
    () => import('@shikijs/langs-precompiled/markdown'),
  ],
  engine: createJavaScriptRawEngine(),
}).then((highlighter) => {
  precompiledHighlighter = highlighter
  post({type: 'ready', core: 'precompiled', languages: highlighter.getLoadedLanguages()})
  warmupLanguages(highlighter)
})

void createHighlighterCore({
  themes: [() => import('shiki/themes/github-light.mjs'), () => import('shiki/themes/github-dark.mjs')],
  langs: [() => import('shiki/langs/bash.mjs')],
  engine: createJavaScriptRegexEngine(),
}).then((highlighter) => {
  regexHighlighter = highlighter
  post({type: 'ready', core: 'regex', languages: highlighter.getLoadedLanguages()})
  warmupLanguages(highlighter)
})

self.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  handleHighlightRequest(event.data)
})
