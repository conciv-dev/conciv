import {createClipboardCopy, type ClipboardCopy} from '@conciv/ui-kit-system'

const LABELS = {copied: 'Copied', failed: 'Copy failed'}

export function createResumeCopy(command: () => string, announce: (message: string) => void): ClipboardCopy {
  return createClipboardCopy({
    text: command,
    labels: () => LABELS,
    onCopied: () => announce(LABELS.copied),
    onFailed: () => announce(LABELS.failed),
  })
}
