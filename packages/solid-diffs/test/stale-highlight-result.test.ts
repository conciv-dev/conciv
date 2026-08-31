import {DEFAULT_THEMES, FileRenderer, renderFileWithHighlighter} from '@pierre/diffs'
import type {FileContents, RenderFileOptions} from '@pierre/diffs'
import {expect, test} from 'vitest'

const renderOptions: RenderFileOptions = {
  theme: DEFAULT_THEMES,
  useTokenTransformer: false,
  tokenizeMaxLineLength: 1000,
}

const makeStreamingFile = (lineCount: number): FileContents => ({
  name: 'streaming.ts',
  contents: Array.from({length: lineCount}, (_, index) => `const value${index} = ${index}\n`).join(''),
})

test('a highlight for a superseded file never replaces the current render', async () => {
  let renderUpdates = 0
  const renderer = new FileRenderer({theme: DEFAULT_THEMES}, () => {
    renderUpdates += 1
  })
  const earlyFile = makeStreamingFile(3)
  const currentFile = makeStreamingFile(9)

  renderer.renderFile(earlyFile)
  const highlighter = await renderer.initializeHighlighter()
  const staleResult = renderFileWithHighlighter(earlyFile, highlighter, renderOptions)

  renderer.renderFile(currentFile)
  const updatesBeforeStaleResult = renderUpdates
  renderer.onHighlightSuccess(earlyFile, staleResult, renderOptions)

  expect(renderer.renderFile()?.totalLines).toBe(10)
  expect(renderUpdates).toBe(updatesBeforeStaleResult)
})
