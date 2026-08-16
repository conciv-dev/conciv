import {Check, Copy, X} from 'lucide-react'
import {AnimatePresence, m, useReducedMotion} from 'motion/react'
import {useCallback, useRef, useState, type ReactNode} from 'react'
import {cn} from '@/lib/utils'

type CopyState = 'idle' | 'copied' | 'failed'

const RESET_DELAY_MS = 2000

const FEEDBACK: Record<CopyState, string> = {
  idle: '',
  copied: 'Copied',
  failed: 'Copy failed. Select the text',
}

const ARIA_LABEL: Partial<Record<CopyState, string>> = {
  copied: 'Copied',
  failed: 'Copy failed',
}

const ICONS: Record<CopyState, ReactNode> = {
  idle: <Copy className="size-4" aria-hidden />,
  copied: <Check className="size-4 text-primary" aria-hidden />,
  failed: <X className="size-4 text-destructive" aria-hidden />,
}

function iconMotion(shouldReduceMotion: boolean | null) {
  if (shouldReduceMotion) {
    return {initial: {opacity: 1}, animate: {opacity: 1}, exit: {opacity: 0}, transition: {duration: 0}}
  }
  return {
    initial: {filter: 'blur(8px)', opacity: 0, y: -18},
    animate: {filter: 'blur(0px)', opacity: 1, y: 0},
    exit: {filter: 'blur(8px)', opacity: 0, y: 18},
    transition: {bounce: 0, duration: 0.25, type: 'spring'} as const,
  }
}

export function CopyButton({text, label = 'Copy', className}: {text: string; label?: string; className?: string}) {
  const [state, setState] = useState<CopyState>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const shouldReduceMotion = useReducedMotion()

  const copy = useCallback(async () => {
    clearTimeout(resetTimer.current)
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    resetTimer.current = setTimeout(() => setState('idle'), RESET_DELAY_MS)
  }, [text])

  return (
    <>
      <button
        type="button"
        aria-label={ARIA_LABEL[state] ?? label}
        onClick={() => void copy()}
        className={cn(
          'relative grid size-9 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-lg border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          className,
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <m.span key={state} className="flex items-center justify-center" {...iconMotion(shouldReduceMotion)}>
            {ICONS[state]}
          </m.span>
        </AnimatePresence>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {FEEDBACK[state]}
      </span>
    </>
  )
}
