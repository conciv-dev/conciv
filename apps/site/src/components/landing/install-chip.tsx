import {Check, Copy} from 'lucide-react'
import {useRef, useState} from 'react'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip'

const COMMAND = 'npm i -D @conciv/it'

export function InstallChip() {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const copy = () => {
    void navigator.clipboard.writeText(COMMAND)
    setCopied(true)
    setOpen(true)
    clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => {
      setCopied(false)
      setOpen(false)
    }, 1400)
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="inline-flex items-center gap-2.5 rounded-lg border bg-secondary py-2 pl-3.5 pr-2 font-mono text-[13px]">
        <span className="text-primary">$</span>
        <span>{COMMAND}</span>
        <TooltipProvider delayDuration={250}>
          <Tooltip open={copied || open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={copy}
                aria-label="Copy install command"
                className="group ml-1 inline-grid size-7 place-items-center rounded-md border bg-background text-muted-foreground transition-colors hover:text-foreground active:scale-90"
                data-copied={copied}
              >
                <Copy className="col-start-1 row-start-1 size-3.5 scale-100 opacity-100 transition-all duration-200 group-data-[copied=true]:scale-50 group-data-[copied=true]:opacity-0" />
                <Check className="col-start-1 row-start-1 size-3.5 scale-50 text-primary opacity-0 transition-all duration-200 group-data-[copied=true]:scale-100 group-data-[copied=true]:opacity-100" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              {copied ? 'Copied!' : 'Copy'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <a href="/docs/quick-start" className="text-[13.5px] font-semibold text-primary hover:underline">
        Quick start →
      </a>
    </div>
  )
}
