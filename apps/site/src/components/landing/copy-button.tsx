import {Check, Copy} from 'lucide-react'
import {createContext, useContext, useRef, useState, type ReactNode} from 'react'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'

type CopyButtonContextValue = {copied: boolean}

const CopyButtonContext = createContext<CopyButtonContextValue | null>(null)

function useCopyButton(): CopyButtonContextValue {
  const value = useContext(CopyButtonContext)
  if (!value) throw new Error('CopyButton.* must be used inside CopyButton.Root')
  return value
}

function Root({text, onCopy, children}: {text: string; onCopy?: () => void; children: ReactNode}) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const copy = () => {
    void navigator.clipboard.writeText(text)
    onCopy?.()
    setCopied(true)
    setOpen(true)
    clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => {
      setCopied(false)
      setOpen(false)
    }, 1400)
  }

  return (
    <CopyButtonContext.Provider value={{copied}}>
      <TooltipProvider delayDuration={250}>
        <Tooltip open={copied || open} onOpenChange={setOpen}>
          <span onClick={copy} className="contents">
            {children}
          </span>
        </Tooltip>
      </TooltipProvider>
    </CopyButtonContext.Provider>
  )
}

function Trigger({label = 'Copy'}: {label?: string}) {
  const {copied} = useCopyButton()
  return (
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={label}
        data-copied={copied}
        className="group inline-grid size-7 place-items-center rounded-md border bg-background text-muted-foreground transition-[color,transform] duration-150 hover:text-foreground active:scale-[0.97]"
      >
        <Copy className="col-start-1 row-start-1 size-3.5 scale-100 opacity-100 transition-[transform,opacity] duration-200 group-data-[copied=true]:scale-50 group-data-[copied=true]:opacity-0" />
        <Check className="col-start-1 row-start-1 size-3.5 scale-50 text-primary opacity-0 transition-[transform,opacity] duration-200 group-data-[copied=true]:scale-100 group-data-[copied=true]:opacity-100" />
      </button>
    </TooltipTrigger>
  )
}

function Feedback() {
  const {copied} = useCopyButton()
  return (
    <TooltipContent side="top" sideOffset={6}>
      {copied ? 'Copied!' : 'Copy'}
    </TooltipContent>
  )
}

export const CopyButton = {Root, Trigger, Feedback}
