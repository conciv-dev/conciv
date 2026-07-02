import {defineCommand} from 'citty'
import {serverCommand} from './server.js'
import {pageCommand, reactCommand} from './page.js'
import {openCommand} from './open.js'

export const toolsCommand = defineCommand({
  meta: {name: 'tools', description: 'inspect & drive the live dev server — page, react, server'},
  subCommands: {server: serverCommand, page: pageCommand, react: reactCommand, open: openCommand},
})
