import {splitProps, type JSX} from 'solid-js'
import {Button} from './button.js'
import {Dialog} from './dialog.js'

const DESCRIPTION = 'm-0 text-[0.8125rem] leading-[1.45] text-chat-text-2'
const ACTIONS = 'flex items-center justify-end gap-1.5'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: JSX.Element
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
}

export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element {
  const [local] = splitProps(props, [
    'open',
    'onOpenChange',
    'title',
    'description',
    'confirmLabel',
    'cancelLabel',
    'onConfirm',
  ])
  let cancel: HTMLButtonElement | undefined
  return (
    <Dialog
      open={local.open}
      onOpenChange={local.onOpenChange}
      title={local.title}
      role="alertdialog"
      dismissable
      initialFocus={() => cancel ?? null}
      footer={
        <div class={ACTIONS}>
          <Button
            ref={(element) => {
              cancel = element
            }}
            variant="outline"
            onClick={() => local.onOpenChange(false)}
          >
            {local.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              local.onConfirm()
              local.onOpenChange(false)
            }}
          >
            {local.confirmLabel}
          </Button>
        </div>
      }
    >
      <Dialog.Description class={DESCRIPTION}>{local.description}</Dialog.Description>
    </Dialog>
  )
}
