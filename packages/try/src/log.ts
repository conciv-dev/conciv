import {initLogger} from 'evlog'
import {readLogLevel} from '@conciv/types/config-types'

export function startTryLog(): void {
  const level = readLogLevel({env: process.env.CONCIV_LOG_LEVEL})
  initLogger({
    enabled: level !== 'off',
    ...(level === 'off' ? {} : {minLevel: level}),
    env: {service: 'conciv-try'},
    pretty: false,
    silent: true,
    _suppressDrainWarning: true,
    drain: ({event}) => {
      process.stderr.write(`${JSON.stringify(event)}\n`)
    },
  })
}
