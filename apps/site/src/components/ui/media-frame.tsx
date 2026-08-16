import {Maximize2} from 'lucide-react'
import type {ReactNode} from 'react'
import {Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger} from '@/components/ui/dialog'
import {cn} from '@/lib/utils'

const FILL_CLASSES = {
  mat: 'h-[calc(100%+0.75rem)]',
  frame: 'h-full',
  button: 'h-full',
  image: 'size-full object-cover',
}

const NO_FILL_CLASSES = {mat: '', frame: '', button: '', image: ''}

export function MediaFrame({
  src,
  width,
  height,
  alt,
  title,
  fill = false,
  className,
  children,
}: {
  src: string
  width: number
  height: number
  alt: string
  title: string
  fill?: boolean
  className?: string
  children?: ReactNode
}) {
  const fillClass = fill ? FILL_CLASSES : NO_FILL_CLASSES
  return (
    <Dialog>
      <div className={cn('-m-1.5 border border-dashed p-1.5', fillClass.mat, className)}>
        <div
          className={cn(
            'relative rounded-[2px] border transition-colors duration-[160ms] ease-[var(--od-ease-out)] hover:border-primary/60 focus-within:border-primary/60',
            fillClass.frame,
          )}
        >
          <DialogTrigger
            type="button"
            aria-label={`View ${title} at full size`}
            className={cn(
              'group/media relative block w-full cursor-zoom-in overflow-clip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              fillClass.button,
            )}
          >
            <img
              src={src}
              width={width}
              height={height}
              alt={alt}
              loading="lazy"
              decoding="async"
              className={cn('block w-full', fillClass.image)}
            />
            <span
              aria-hidden
              className="od-caption absolute inset-x-0 bottom-0 z-10 flex h-8 translate-y-full items-center gap-2 border-t border-primary/40 bg-background/95 px-3 text-accent-text transition-transform duration-[160ms] ease-[var(--od-ease-out)] group-focus-visible/media:translate-y-0 motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:group-hover/media:translate-y-0"
            >
              <Maximize2 className="size-4" aria-hidden />
              View full size
            </span>
          </DialogTrigger>
        </div>
      </div>
      {children}
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
  )
}
