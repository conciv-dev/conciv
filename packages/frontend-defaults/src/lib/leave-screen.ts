import type {RegisteredRouter} from '@tanstack/solid-router'

export function leaveScreen(router: RegisteredRouter, sessionId: string | null | undefined): void {
  if (router.history.canGoBack()) {
    router.history.back()
    return
  }
  if (sessionId) {
    void router.navigate({to: '/panel/$sessionId', params: {sessionId}, search: {open: true}, replace: true})
    return
  }
  void router.navigate({to: '/panel/latest', search: {open: true}, replace: true})
}
