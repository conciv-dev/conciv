import type {ReactNode} from 'react'
import {cn} from '@/lib/utils'
import {brandAssetUrl, isDarkBackdrop} from '@/lib/brand-assets'

const LIGHT_BACKDROP = 'bg-[#F3EEE4] ring-foreground/10'
const DARK_BACKDROP = 'bg-[#15161A] ring-white/10'

export function BrandBackdrop({tone, className, children}: {tone: string; className?: string; children: ReactNode}) {
  return (
    <div
      className={cn(
        'grid place-items-center rounded-xl p-8 ring-1',
        isDarkBackdrop(tone) ? DARK_BACKDROP : LIGHT_BACKDROP,
        className,
      )}
    >
      {children}
    </div>
  )
}

export function BrandImage({path, alt, className}: {path: string; alt: string; className?: string}) {
  return <img src={brandAssetUrl(path)} alt={alt} className={className} />
}
