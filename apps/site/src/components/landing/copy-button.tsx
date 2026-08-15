import {Check, Copy} from 'lucide-react'
import {createContext, useContext, useRef, useState, type ReactNode} from 'react'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'

type CopyState = 'idle' | 'copied' | 'failed'

type CopyButtonContextValue = {state: CopyState}

const CopyButtonContext = createContext<CopyButtonContextValue | null>(null)

function useCopyButton(): CopyButtonContextValue {
  const value = useContext(CopyButtonContext)
  if (!value) throw new Error('CopyButton.* must be used inside CopyButton.Root')
  return value
}

const RESET_DELAY_MS = 1400

function feedbackLabel(state: CopyState): string {
  if (state === 'copied') return 'Copied'
  if (state === 'failed') return 'Copy failed — select the text'
  return ''
}

function Root({text, onCopy, children}: {text: string; onCopy?: () => void; children: ReactNode}) {
  const [state, setState] = useState<CopyState>('idle')
  const [open, setOpen] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const copy = async () => {
    clearTimeout(resetTimer.current)
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
      onCopy?.()
    } catch {
      setState('failed')
    }
    setOpen(true)
    resetTimer.current = setTimeout(() => {
      setState('idle')
      setOpen(false)
    }, RESET_DELAY_MS)
  }

  return (
    <CopyButtonContext.Provider value={{state}}>
      <TooltipProvider delayDuration={250}>
        <Tooltip open={state !== 'idle' || open} onOpenChange={setOpen}>
          <span onClick={() => void copy()} className="contents">
            {children}
          </span>
        </Tooltip>
      </TooltipProvider>
      <span role="status" aria-live="polite" className="sr-only">
        {feedbackLabel(state)}
      </span>
    </CopyButtonContext.Provider>
  )
}

function Trigger({label = 'Copy'}: {label?: string}) {
  const {state} = useCopyButton()
  return (
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={label}
        data-copied={state === 'copied'}
        className="group inline-grid size-7 place-items-center rounded-md border bg-background text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <Copy className="col-start-1 row-start-1 size-3.5 opacity-100 transition-opacity duration-150 group-data-[copied=true]:opacity-0" />
        <Check className="col-start-1 row-start-1 size-3.5 text-primary opacity-0 transition-opacity duration-150 group-data-[copied=true]:opacity-100" />
      </button>
    </TooltipTrigger>
  )
}

function Feedback() {
  const {state} = useCopyButton()
  return (
    <TooltipContent side="top" sideOffset={6}>
      {state === 'idle' ? 'Copy' : feedbackLabel(state)}
    </TooltipContent>
  )
}

export const CopyButton = {Root, Trigger, Feedback}
