import {stripVTControlCharacters} from 'node:util'
import react from '@vitejs/plugin-react'
import {createLogger, createServer, type ViteDevServer} from 'vite'
import {DESIGN_TOOL_PREFIX} from '@conciv/extension-design/defs'
import {DESIGN_TOOLS} from '@conciv/extension-design/design-tools'
import {unplugin} from '../plugin-instance.js'

export async function hostServer(input: {
  project: string
  devEndpointDir: string
  port: number
  agent: boolean
  blind: boolean
  noDesign: boolean
  noCatalog: boolean
  show: 'progress'[]
  open: 'query'[]
  browserDriver?: string
  printed: string[]
}): Promise<ViteDevServer> {
  const server = await createServer({
    root: input.project,
    configFile: false,
    customLogger: {
      ...createLogger('silent'),
      info: (message) => {
        input.printed.push(message)
        message
          .split('\n')
          .filter((line) => line.includes(LOGIN_MARK))
          .forEach((line) => process.stdout.write(`${stripVTControlCharacters(line).trim()}\n`))
      },
    },
    server: {host: '127.0.0.1', port: input.port},
    plugins: [
      react(),
      unplugin.vite({
        ...(input.agent ? {} : {systemPrompt: false}),
        devEndpointDir: input.devEndpointDir,
        extensions: {
          design: {
            blind: input.blind,
            show: input.show,
            ...(input.noCatalog ? {catalog: {section: false, hint: false}} : {}),
          },
          ...(input.browserDriver === undefined ? {} : {'browser-driver': {endpoint: input.browserDriver}}),
        },
        withhold: [
          ...(input.blind ? ['page_screenshot'] : []),
          ...(input.open.includes('query') ? [] : [`${DESIGN_TOOL_PREFIX}query`]),
          `${DESIGN_TOOL_PREFIX}write`,
          ...(input.noDesign ? [getDef, checkDef, statusDef].map((tool) => tool.name) : []),
        ],
      }),
    ],
  })
  await server.listen()
  return server
}

const LOGIN_MARK = '#conciv_otp='

const [getDef, checkDef, statusDef] = DESIGN_TOOLS
