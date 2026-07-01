import {type RefObject} from 'react'
import {ArrowUp, Crosshair} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {cn} from '@/lib/utils'
import {GrabReference} from './grab-reference'
import type {Pickable} from './demo-data'

export function Composer({
  grabbed,
  picking,
  value,
  onValueChange,
  onArm,
  onSend,
  grabRef,
}: {
  grabbed: Pickable | null
  picking: boolean
  value: string
  onValueChange: (v: string) => void
  onArm: () => void
  onSend: () => void
  grabRef: RefObject<HTMLButtonElement | null>
}) {
  return (
    <div className="border-t p-3">
      {grabbed ? <GrabReference pickable={grabbed} /> : null}
      <div className="flex flex-col gap-3 rounded-xl border bg-secondary p-3">
        <Input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSend()
          }}
          placeholder="tell conciv what to change…"
          className="h-7 border-0 bg-transparent px-0 text-[14.5px] caret-primary shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <div className="flex items-center gap-2">
          <Button
            ref={grabRef}
            type="button"
            onClick={onArm}
            size="sm"
            className={cn('od-grab-pill gap-1.5', picking && 'ring-2 ring-primary ring-offset-2')}
          >
            <Crosshair className="size-4" />
            Grab element
          </Button>
          <Button
            type="button"
            onClick={onSend}
            size="icon"
            variant="default"
            className="ml-auto bg-foreground text-background"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
