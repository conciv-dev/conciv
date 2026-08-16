import {Maximize2} from 'lucide-react'
import {useState, type ReactNode} from 'react'
import {Dialog, DialogContent, DialogDescription, DialogTitle} from '@/components/ui/dialog'
import {cn} from '@/lib/utils'

export function MediaFrame({
  src,
  width,
  height,
  alt,
  title,
  className,
  children,
}: {
  src: string
  width: number
  height: number
  alt: string
  title: string
  className?: string
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className={cn('-m-1.5 border border-dashed p-1.5', className)}>
        <div className="group/media relative overflow-clip rounded-xs border transition-colors duration-100 hover:border-primary/60 focus-within:border-primary/60">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`View ${title} at full size`}
            className="block w-full cursor-zoom-in focus-visible:outline-none"
          >
            <img
              src={src}
              width={width}
              height={height}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="block w-full"
            />
          </button>
          <div className="od-caption absolute inset-x-0 bottom-0 z-10 flex translate-y-full items-center border-t border-primary/40 bg-background/95 text-primary transition-transform duration-100 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover/media:translate-y-0 group-focus-within/media:translate-y-0 motion-reduce:transition-none">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <Maximize2 className="size-3.5" aria-hidden />
              View full size
            </button>
          </div>
        </div>
      </div>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(1400px,calc(100%-2rem))] gap-2 p-2 pt-12 sm:max-w-[min(1400px,calc(100%-2rem))]">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{alt}</DialogDescription>
          <img
            src={src}
            width={width}
            height={height}
            alt={alt}
            className="block max-h-[85dvh] w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
