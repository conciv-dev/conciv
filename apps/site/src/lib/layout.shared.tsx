import type {BaseLayoutProps} from 'fumadocs-ui/layouts/shared'
import {ConcivLockup} from '@internal/brand-react'

const themeSwitchClass = [
  'not-dark:[&>svg:first-child]:bg-fd-accent',
  'not-dark:[&>svg:first-child]:text-fd-accent-foreground',
  'dark:[&>svg:last-child]:bg-fd-accent',
  'dark:[&>svg:last-child]:text-fd-accent-foreground',
].join(' ')

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <ConcivLockup interactive className="h-6 w-auto" />,
    },
    themeSwitch: {className: themeSwitchClass},
  }
}
