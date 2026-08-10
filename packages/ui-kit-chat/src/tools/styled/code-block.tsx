import {splitProps, type JSX} from 'solid-js'
import {cva} from 'class-variance-authority'
import {SolidCodeBlock, SolidFileDiff, type FileDiffOptions} from '@conciv/solid-diffs'
import {CODE_BLOCK_OPTIONS} from '../primitives/tool-presentation.js'

const BLESSED_DIFF_OPTIONS: FileDiffOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  disableFileHeader: true,
  diffStyle: 'unified',
  overflow: 'wrap',
}

const codeBlock = cva(
  'block w-full overflow-auto rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)]',
  {
    variants: {
      size: {
        xs: 'text-[length:var(--chat-text-xs)]',
        sm: 'text-[length:var(--chat-text-sm)]',
      },
      maxHeight: {
        result: 'max-h-[13.75rem]',
        log: 'max-h-80',
      },
    },
    defaultVariants: {size: 'xs', maxHeight: 'result'},
  },
)

const diffBlock = cva(
  'block w-full max-h-80 overflow-auto rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)]',
  {
    variants: {
      size: {
        xs: 'text-[length:var(--chat-text-xs)]',
        sm: 'text-[length:var(--chat-text-sm)]',
      },
    },
    defaultVariants: {size: 'xs'},
  },
)

export function CodeBlock(props: {
  file: {name: string; lang: string; contents: string}
  size?: 'xs' | 'sm'
  maxHeight?: 'result' | 'log'
  class?: string
}): JSX.Element {
  const [local] = splitProps(props, ['file', 'size', 'maxHeight', 'class'])
  const blockClass = (): string =>
    `${codeBlock({size: local.size ?? 'xs', maxHeight: local.maxHeight ?? 'result'})} ${local.class ?? ''}`
  return <SolidCodeBlock class={blockClass()} options={CODE_BLOCK_OPTIONS} file={local.file} />
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
  return <SolidFileDiff class={blockClass()} options={BLESSED_DIFF_OPTIONS} oldFile={oldFile()} newFile={newFile()} />
}
