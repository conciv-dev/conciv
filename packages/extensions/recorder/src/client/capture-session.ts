import type {RecorderConfig, RrwebEvent} from '../shared/protocol.js'
import {startCapture, takeFreshSnapshot} from './capture.js'
import {createFlusher} from './flusher.js'
import {createVisibilityPauser} from './visibility-pauser.js'

export type CaptureSession = {
  takeSnapshot(): void
  flushNow(): Promise<void>
  finish(): Promise<void>
}

export function createCaptureSession(opts: {
  config: RecorderConfig
  reloadConfig: () => Promise<RecorderConfig>
  send: (events: RrwebEvent[]) => Promise<void>
  onFailed: () => void
}): CaptureSession {
  const flusher = createFlusher({send: opts.send})
  flusher.setLive(true)
  let generation = 0
  let stopRecord: (() => void) | undefined = startCapture(opts.config, (event) => flusher.push(event))
  const offListeners: (() => void)[] = []
  const listenFlush = (target: Window | Document, name: string): void => {
    const handler = (): void => void flusher.flushNow()
    target.addEventListener(name, handler)
    offListeners.push(() => target.removeEventListener(name, handler))
  }
  listenFlush(window, 'error')
  listenFlush(window, 'unhandledrejection')
  listenFlush(window, 'beforeunload')
  listenFlush(document, 'visibilitychange')
  const pauser = createVisibilityPauser({
    isHidden: () => document.visibilityState === 'hidden',
    pause: () => {
      generation += 1
      stopRecord?.()
      stopRecord = undefined
      void flusher.flushNow()
    },
    resume: () => {
      generation += 1
      const resumedGeneration = generation
      void opts
        .reloadConfig()
        .then((resumedConfig) => {
          if (generation !== resumedGeneration) return
          stopRecord = startCapture(resumedConfig, (event) => flusher.push(event))
        })
        .catch(() => {
          if (generation === resumedGeneration) opts.onFailed()
        })
    },
  })
  document.addEventListener('visibilitychange', pauser.onVisibilityChange)
  offListeners.push(() => {
    pauser.dispose()
    document.removeEventListener('visibilitychange', pauser.onVisibilityChange)
  })
  return {
    takeSnapshot: () => takeFreshSnapshot(),
    flushNow: () => flusher.flushNow(),
    async finish() {
      generation += 1
      stopRecord?.()
      stopRecord = undefined
      for (const off of offListeners) off()
      await flusher.flushNow()
      flusher.dispose()
    },
  }
}
