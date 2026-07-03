import {type RefObject} from 'react'
import {ScrollArea} from '@/components/ui/scroll-area'
import {MessageRow} from './message-row'
import type {Message} from './demo-data'

export function Transcript({
  messages,
  hint,
  viewportRef,
}: {
  messages: Message[]
  hint: boolean
  viewportRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <ScrollArea className="min-h-0 flex-1" data-lenis-prevent>
      <div ref={viewportRef} className="flex flex-col gap-2.5 p-4">
        {messages.map((message, i) => (
          <MessageRow key={i} message={message} />
        ))}
        {hint && (
          <div className="font-mono text-[12px] text-muted-foreground/60">
            try: grab the <span className="text-primary/70">Get started</span> button →
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
