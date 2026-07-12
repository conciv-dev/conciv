import type {AnyRouter} from '@tanstack/solid-router'

export function setShutter(router: AnyRouter, open: boolean): void {
  const value: true | undefined = open ? true : undefined
  void router.navigate({
    to: '.',
    search: (prev: Record<string, unknown>) => ({...prev, open: value}),
    replace: true,
  })
}
