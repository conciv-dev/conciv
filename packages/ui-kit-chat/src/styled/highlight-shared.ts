import type {HighlighterCore} from 'shiki/core'
import {CODE_THEME_NAME} from '../theme/code-theme-tokens.js'

export const WARMUP_SNIPPETS: Record<string, string> = {
  typescript: [
    'interface Point {',
    '  x: number',
    '  y: number',
    '}',
    '',
    'function distance(a: Point, b: Point): number {',
    '  const dx = a.x - b.x',
    '  const dy = a.y - b.y',
    '  return Math.sqrt(dx * dx + dy * dy)',
    '}',
    '',
    '// distance between two points',
    'const origin: Point = {x: 0, y: 0}',
    'const label = `origin at (${origin.x}, ${origin.y})`',
  ].join('\n'),
  tsx: [
    'type Props = {name: string; count: number}',
    '',
    'function Greeting(props: Props) {',
    '  const label = `Hello, ${props.name}!`',
    '  return (',
    '    <div className="greeting">',
    '      <span>{label}</span>',
    '      {props.count > 0 ? <em>{props.count} new</em> : null}',
    '    </div>',
    '  )',
    '}',
  ].join('\n'),
  javascript: [
    'function formatDuration(seconds) {',
    '  const minutes = Math.floor(seconds / 60)',
    '  const rest = seconds % 60',
    '  return `${minutes}m ${rest}s`',
    '}',
    '',
    '// example usage',
    'const values = [30, 90, 125]',
    'for (const value of values) {',
    '  console.log(formatDuration(value))',
    '}',
  ].join('\n'),
  jsx: [
    'function List({items}) {',
    '  return (',
    '    <ul className="list">',
    '      {items.map((item) => (',
    '        <li key={item.id}>{item.label}</li>',
    '      ))}',
    '    </ul>',
    '  )',
    '}',
  ].join('\n'),
  json: [
    '{',
    '  "name": "example",',
    '  "version": "1.0.0",',
    '  "private": true,',
    '  "scripts": {',
    '    "build": "tsc",',
    '    "test": "vitest run"',
    '  },',
    '  "keywords": ["demo", "sample"]',
    '}',
  ].join('\n'),
  css: [
    '.card {',
    '  display: flex;',
    '  flex-direction: column;',
    '  gap: 0.5rem;',
    '  padding: 1rem;',
    '  border-radius: 8px;',
    '  background-color: var(--surface);',
    '}',
    '',
    '.card:hover {',
    '  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);',
    '}',
  ].join('\n'),
  html: [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <title>Example</title>',
    '  </head>',
    '  <body>',
    '    <main class="content">',
    '      <h1>Hello</h1>',
    '    </main>',
    '  </body>',
    '</html>',
  ].join('\n'),
  bash: [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    'for file in *.ts; do',
    '  echo "checking $file"',
    'done',
    '',
    'if [ -f package.json ]; then',
    '  echo "found manifest"',
    'fi',
  ].join('\n'),
  markdown: [
    '# Example title',
    '',
    'A short paragraph with **bold** and _italic_ text.',
    '',
    '- first item',
    '- second item',
    '',
    '> a short blockquote',
  ].join('\n'),
}

export function scheduleIdle(callback: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => callback(), {timeout: 500})
    return
  }
  setTimeout(callback, 0)
}

export function warmupLanguages(highlighter: HighlighterCore): void {
  const languages = highlighter.getLoadedLanguages()
  const warmAt = (index: number): void => {
    const language = languages[index]
    if (language === undefined) return
    try {
      const snippet = WARMUP_SNIPPETS[language] ?? 'const value = 1'
      highlighter.codeToHtml(snippet, {lang: language, theme: CODE_THEME_NAME})
    } catch {}
    scheduleIdle(() => warmAt(index + 1))
  }
  scheduleIdle(() => warmAt(0))
}

export type HighlightCore = 'precompiled' | 'regex'

export type HighlightRequestMessage = {type: 'highlight'; id: string; code: string; lang: string}

export type HighlightReadyMessage = {type: 'ready'; core: HighlightCore; languages: string[]}

export type HighlightResultMessage = {type: 'result'; id: string; html: string}

export type WorkerToMainMessage = HighlightReadyMessage | HighlightResultMessage

export type MainToWorkerMessage = HighlightRequestMessage
