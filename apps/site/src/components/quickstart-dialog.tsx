import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {SetupPrompt} from './setup-prompt'

export function QuickstartDialog({className}: {className?: string}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" className={className}>
          Quickstart
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Copy Prompt</DialogTitle>
          <DialogDescription>Pick your framework, then copy this prompt into your agent.</DialogDescription>
        </DialogHeader>
        <SetupPrompt className="my-0" />
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
