import type {ComponentProps} from 'react'
import {Callout as FumadocsCallout} from 'fumadocs-ui/components/callout'
import {cn} from '@/lib/utils'

const tipColor: Record<'--callout-color', string> = {'--callout-color': 'var(--color-fd-success)'}

export function Callout({type, className, style, ...props}: ComponentProps<typeof FumadocsCallout>) {
  const tip = type === 'idea' || type === 'success'

  return (
    <FumadocsCallout
      type={type}
      style={tip ? {...tipColor, ...style} : style}
      className={cn('border-(--callout-color)/40 bg-(--callout-color)/8 ps-3 [&>[role=none]]:hidden', className)}
      {...props}
    />
  )
}
