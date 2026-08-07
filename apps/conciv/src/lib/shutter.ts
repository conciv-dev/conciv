import type {AnyRouter} from '@tanstack/solid-router'

export function setShutter(router: AnyRouter, open: boolean): Promise<void> {
  const value: true | undefined = open ? true : undefined
  return router.navigate({
    to: '.',
    search: (prev: Record<string, unknown>) => ({...prev, open: value}),
    replace: true,
  })
}
