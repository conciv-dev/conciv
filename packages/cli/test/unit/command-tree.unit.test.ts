import {expect, it} from 'vitest'
import {readCommandTree} from '../../src/command-tree.js'

it('the command tree lists every command once with only the flags it adds', () => {
  const commands = readCommandTree()
  const paths = commands.map((command) => command.path)
  const root = commands.find((command) => command.path === 'conciv')
  const tabs = commands.find((command) => command.path === 'conciv tools tabs')

  expect(new Set(paths).size).toBe(paths.length)
  expect(root?.params.map((param) => param.name)).toContain('tab')
  expect(tabs).toMatchObject({runs: true})
  expect(tabs?.params.map((param) => param.name)).not.toContain('tab')
})
