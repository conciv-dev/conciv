import {readSessionStorage} from './session-storage'

const LAST_SCREEN_KEY = 'conciv-last-screen'

export function readLastScreen(): string {
  try {
    return readSessionStorage()?.getItem(LAST_SCREEN_KEY) ?? '/'
  } catch (error) {
    console.error('[persistence] could not read the last screen of this tab', error)
    return '/'
  }
}

export function keepLastScreen(href: string): void {
  try {
    readSessionStorage()?.setItem(LAST_SCREEN_KEY, href)
  } catch (error) {
    console.error('[persistence] could not keep the last screen of this tab', error)
  }
}
