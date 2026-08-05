import {describe, expect, it} from 'vitest'
import {initCommand} from '../src/init.js'

describe('init command', () => {
  it('declares the three flags with kebab-case names', () => {
    const args = initCommand.args
    expect(args).toMatchObject({
      yes: {type: 'boolean', default: false},
      'dry-run': {type: 'boolean', default: false},
      force: {type: 'boolean', default: false},
    })
  })

  it('registers under the root command', async () => {
    const {main} = await import('../src/bin.js')
    const subCommands = await Promise.resolve(main.subCommands)
    expect(Object.keys(subCommands ?? {})).toContain('init')
  })
})
