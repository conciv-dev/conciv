import {description, name, route, version} from '@bomb.sh/router'
import cliManifest from '../package.json' with {type: 'json'}
import {authRoute} from './auth.js'
import {envelopeFlag} from './envelope.js'
import {initCommand} from './init.js'
import {mcpCommand} from './hub.js'
import {tabFlag} from './tab-flag.js'
import {toolsRoute} from './tools.js'

export const main = route(
  name('conciv'),
  description('The conciv dev-agent CLI.'),
  version(cliManifest.version),
  envelopeFlag,
  tabFlag,
  toolsRoute,
  initCommand,
  authRoute,
  mcpCommand,
)
