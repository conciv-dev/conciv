import {initLogger} from 'evlog'
import type {LogLevel} from '@conciv/types/config-types'

export function startCliLog(level: LogLevel): void {
  initLogger({
    enabled: level !== 'off',
    ...(level === 'off' ? {} : {minLevel: level}),
    env: {service: 'conciv-cli'},
    pretty: false,
    silent: true,
    _suppressDrainWarning: true,
    drain: ({event}) => {
      process.stderr.write(`${JSON.stringify(event)}\n`)
    },
  })
}
