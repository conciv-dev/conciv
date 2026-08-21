import {splitProps, type JSX} from 'solid-js'
import {cva} from 'class-variance-authority'
import {SolidCodeBlock, SolidFileDiff, type FileDiffOptions} from '@conciv/solid-diffs'
import {codeBlockOptions, codeBlockFileChromeOptions, codeLineOptions} from '../primitives/tool-presentation.js'
import {useEmbeddedCard} from './card-chrome.js'
import {codeTheme} from '../../theme/code-theme.js'

function blessedDiffOptions(): FileDiffOptions<undefined> {
  return {
    theme: codeTheme(),
    themeType: 'system',
    disableFileHeader: true,
    diffStyle: 'unified',
    overflow: 'wrap',
  }
}

const codeBlock = cva('block w-full min-w-0 overflow-auto [background:transparent] [font-family:var(--chat-mono)]', {
  variants: {
    size: {
      xs: 'text-[length:var(--chat-text-xs)] leading-[var(--chat-trace-gutter)]',
      sm: 'text-[length:var(--chat-text-sm)]',
    },
    maxHeight: {
      result: 'max-h-[13.75rem]',
      log: 'max-h-80',
      none: '',
    },
    chrome: {
      plain: '[--diffs-gap-block:0px] [--diffs-gap-inline:0px]',
      file: '',
      line: 'whitespace-nowrap [--diffs-gap-block:0px] [--diffs-gap-inline:0px]',
    },
  },
  defaultVariants: {size: 'xs', maxHeight: 'result', chrome: 'plain'},
})

const diffBlock = cva(
  'block w-full min-w-0 max-h-80 overflow-auto [background:transparent] [font-family:var(--chat-mono)]',
  {
    variants: {
      size: {
        xs: 'text-[length:var(--chat-text-xs)] leading-[var(--chat-trace-gutter)]',
        sm: 'text-[length:var(--chat-text-sm)]',
      },
    },
    defaultVariants: {size: 'xs'},
  },
)

export function CodeBlock(props: {
  file: {name: string; lang?: string; contents: string}
  size?: 'xs' | 'sm'
  maxHeight?: 'result' | 'log' | 'none'
  chrome?: 'plain' | 'file' | 'line'
  class?: string
}): JSX.Element {
  const [local] = splitProps(props, ['file', 'size', 'maxHeight', 'chrome', 'class'])
  const embedded = useEmbeddedCard()
  const chrome = (): 'plain' | 'file' | 'line' => local.chrome ?? 'plain'
  const cap = (): 'result' | 'log' | 'none' => (embedded() ? 'none' : (local.maxHeight ?? 'result'))
  const blockClass = (): string =>
    `${codeBlock({size: local.size ?? 'xs', maxHeight: cap(), chrome: chrome()})} ${local.class ?? ''}`
  const options = () => {
    if (chrome() === 'file') return codeBlockFileChromeOptions()
    return chrome() === 'line' ? codeLineOptions() : codeBlockOptions()
  }
  return <SolidCodeBlock class={blockClass()} options={options()} file={local.file} />
}

export function diffBlockClass(size: 'xs' | 'sm' = 'xs', class_?: string): string {
  return `${diffBlock({size})} ${class_ ?? ''}`
}

export function DiffBlock(props: {
  file: {name: string; before: string; after: string; lang?: string}
  size?: 'xs' | 'sm'
  class?: string
}): JSX.Element {
  const [local] = splitProps(props, ['file', 'size', 'class'])
  const blockClass = (): string => `${diffBlock({size: local.size ?? 'xs'})} ${local.class ?? ''}`
  const oldFile = (): {name: string; contents: string; lang?: string} => ({
    name: local.file.name,
    contents: local.file.before,
    lang: local.file.lang,
  })
  const newFile = (): {name: string; contents: string; lang?: string} => ({
    name: local.file.name,
    contents: local.file.after,
    lang: local.file.lang,
  })
  return <SolidFileDiff class={blockClass()} options={blessedDiffOptions()} oldFile={oldFile()} newFile={newFile()} />
}
