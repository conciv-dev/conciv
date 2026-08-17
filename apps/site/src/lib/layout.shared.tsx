import type {BaseLayoutProps} from 'fumadocs-ui/layouts/shared'
import {ConcivLockup} from '@conciv/brand/react'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <ConcivLockup interactive className="h-6 w-auto" />,
    },
  }
}
