import {type RefObject} from 'react'
import {ScrollArea} from '@/components/ui/scroll-area'
import {MessageRow} from './message-row'
import type {Message} from './demo-data'

export function Transcript({
  messages,
  viewportRef,
}: {
  messages: Message[]
  viewportRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div ref={viewportRef} className="flex flex-col gap-2.5 p-4">
        {messages.map((message, i) => (
          <MessageRow key={i} message={message} />
        ))}
      </div>
    </ScrollArea>
  )
}
