import {Badge} from '@/components/ui/badge'
import {cn} from '@/lib/utils'
import type {Message} from './demo-data'

const CHECK = '\u00A0\u2713'

export function MessageRow({message}: {message: Message}) {
  if (message.kind === 'user') {
    return (
      <div className="od-msg flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-primary px-3 py-1.5 text-[13px] text-primary-foreground">
          <span className="font-sans">{message.text}</span>
          {message.grabbedHtml ? (
            <span className="mt-1 block font-mono text-[11px] opacity-80">{message.grabbedHtml}</span>
          ) : null}
        </div>
      </div>
    )
  }

  if (message.kind === 'think') {
    return (
      <div className="od-msg font-mono text-[12.5px] text-muted-foreground/80">
        {'✦'} {message.text}
      </div>
    )
  }

  if (message.kind === 'agent') {
    return <div className="od-msg font-sans text-[13px] text-foreground">{message.text}</div>
  }

  if (message.kind === 'tool') {
    return (
      <div className="od-msg flex items-start gap-2 font-mono text-[12.5px]">
        <Badge variant="secondary" className="shrink-0 bg-accent font-semibold text-accent-foreground">
          {message.label}
        </Badge>
        <span className="min-w-0 flex-1 text-muted-foreground">
          {message.detail}
          <span style={{color: 'var(--od-pass)'}}>{CHECK}</span>
        </span>
      </div>
    )
  }

  return (
    <div
      className={cn('od-msg flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-mono text-[12.5px] font-medium')}
      style={{background: 'color-mix(in oklch, var(--od-pass) 14%, transparent)', color: 'var(--od-pass)'}}
    >
      <span className="font-semibold">{'✓'}</span>
      {message.text}
    </div>
  )
}
