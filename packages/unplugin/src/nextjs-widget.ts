import {readLogLevel} from '@conciv/types/config-types'
import {startConcivWidget} from './core/widget-start.js'

const port = process.env.NEXT_PUBLIC_CONCIV_PORT

if (port) startConcivWidget(Number(port), readLogLevel({env: process.env.NEXT_PUBLIC_CONCIV_LOG_LEVEL}))
