import type {PageCapture, PageNodeShot} from '@conciv/extension-page/defs'

export type Driver = {
  capture: (input: {href: string; width: number; height: number; scale: number; hide: string[]}) => Promise<PageCapture>
  node: (input: {
    href: string
    selector: string
    width: number
    height: number
    scale: number
    reference?: string
  }) => Promise<PageNodeShot>
  close: () => Promise<void>
}
