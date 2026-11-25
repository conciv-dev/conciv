import type {BaseLayoutProps} from 'fumadocs-ui/layouts/shared'
import {ConcivLockup} from '@internal/brand-react'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <ConcivLockup interactive className="h-6 w-auto" />,
    },
  }
}
