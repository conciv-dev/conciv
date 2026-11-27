/// <reference lib="dom" />
import {initLogger, log} from 'evlog'
import type {LogLevel} from '@conciv/types/config-types'

export function startPageLog(level: LogLevel): void {
  initLogger({
    enabled: level !== 'off',
    ...(level === 'off' ? {} : {minLevel: level}),
    env: {service: 'conciv-page'},
    _suppressDrainWarning: true,
  })
}

export function logWidgetFailure(error: unknown): void {
  log.error({action: 'widget', message: 'the widget failed to start', error})
}

async function mountWidget(level: LogLevel): Promise<void> {
  const {mountConciv} = await import('@conciv/app')
  await mountConciv([], level)
}

export function isEnginePort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

function canMount(port: number): boolean {
  return typeof window !== 'undefined' && process.env.NODE_ENV !== 'production' && isEnginePort(port)
}

export function startConcivWidget(port: number, level: LogLevel = 'off'): void {
  if (!canMount(port)) return
  startPageLog(level)
  window.__CONCIV_API_BASE__ ??= `http://127.0.0.1:${port}`
  const startWhenReady = (): void => {
    mountWidget(level).catch(logWidgetFailure)
  }
  if (document.readyState !== 'loading') return startWhenReady()
  document.addEventListener('DOMContentLoaded', startWhenReady, {once: true})
}

declare global {
  interface Window {
    __CONCIV_API_BASE__?: string
  }
}
