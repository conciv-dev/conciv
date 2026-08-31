import {createEffect, createSignal, on, type Accessor} from 'solid-js'
import {writeClipboard} from '@solid-primitives/clipboard'
import {makeTimer} from '@solid-primitives/timer'

export type ClipboardCopyStatus = 'idle' | 'copied' | 'failed'

export type ClipboardCopyLabels = {copied: string; failed: string}

export type ClipboardCopyOptions = {
  text: () => string
  resetMs?: () => number | undefined
  labels?: () => Partial<ClipboardCopyLabels> | undefined
  writeText?: (text: string) => Promise<void>
  onCopied?: () => void
  onFailed?: () => void
}

export type ClipboardCopy = {
  status: Accessor<ClipboardCopyStatus>
  copied: Accessor<boolean>
  failed: Accessor<boolean>
  announcement: Accessor<string>
  copy: () => void
}

const RESET_MS = 2_000

const DEFAULT_LABELS: ClipboardCopyLabels = {
  copied: 'Copied to clipboard',
  failed: 'Could not copy to clipboard',
}

export function writeClipboardText(text: string): Promise<void> {
  return writeClipboard(text)
}

export function createClipboardCopy(options: ClipboardCopyOptions): ClipboardCopy {
  const [status, setStatus] = createSignal<ClipboardCopyStatus>('idle', {equals: false})
  const resetMs = () => options.resetMs?.() ?? RESET_MS
  createEffect(
    on(status, (current) => {
      if (current === 'idle') return
      makeTimer(() => setStatus('idle'), resetMs(), setTimeout)
    }),
  )
  const copy = () => {
    const write = options.writeText ?? writeClipboardText
    Promise.resolve()
      .then(() => write(options.text()))
      .then(
        () => {
          setStatus('copied')
          options.onCopied?.()
        },
        () => {
          setStatus('failed')
          options.onFailed?.()
        },
      )
  }
  const announcement = () => {
    const current = status()
    if (current === 'idle') return ''
    const labels = options.labels?.()
    if (current === 'copied') return labels?.copied ?? DEFAULT_LABELS.copied
    return labels?.failed ?? DEFAULT_LABELS.failed
  }
  return {
    status,
    copied: () => status() === 'copied',
    failed: () => status() === 'failed',
    announcement,
    copy,
  }
}
