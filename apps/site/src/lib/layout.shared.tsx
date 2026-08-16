import type {BaseLayoutProps} from 'fumadocs-ui/layouts/shared'
import {BrandMark} from '@/components/brand-mark'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <BrandMark />,
    },
  }
}
