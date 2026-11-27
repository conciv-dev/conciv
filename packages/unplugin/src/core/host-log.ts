import {initLogger} from 'evlog'
import {readLogLevel, type LogLevel} from '@conciv/types/config-types'

export function startHostLog(config: LogLevel | undefined): LogLevel {
  const level = readLogLevel({env: process.env.CONCIV_LOG_LEVEL, config})
  initLogger({
    enabled: level !== 'off',
    ...(level === 'off' ? {} : {minLevel: level}),
    env: {service: 'conciv-unplugin'},
    pretty: false,
    silent: true,
    _suppressDrainWarning: true,
    drain: ({event}) => {
      process.stderr.write(`${JSON.stringify(event)}\n`)
    },
  })
  return level
}
