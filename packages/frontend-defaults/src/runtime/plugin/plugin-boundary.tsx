import type {JSX} from 'solid-js'
import {ErrorScreen} from '../../shell/error-screen.js'

export function createTabCrash(focusAfterRetry: () => HTMLElement | undefined) {
  const shown: {retry?: HTMLButtonElement} = {}
  const retry = (reset: () => void): void => {
    shown.retry = undefined
    reset()
    const target = shown.retry ?? focusAfterRetry()
    target?.focus()
  }

  return (message: string, reset: () => void): JSX.Element => (
    <ErrorScreen
      message={message}
      detail="Details are in the browser console."
      onRetry={() => retry(reset)}
      retryRef={(element) => {
        shown.retry = element
      }}
    />
  )
}
