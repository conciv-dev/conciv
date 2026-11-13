import {describe, expect} from 'vitest'
import {CodeModeCatalog} from '../../../src/core/codemode/catalog.js'
import {CodeModeInstructions} from '../../../src/core/codemode/instructions.js'
import {Effect} from 'effect'
import {it} from '../lib/effect'
import {readInitial, readUpdate} from '../lib/instructions'

const echo: CodeModeCatalog.Tool = {
  type: 'tool',
  name: 'notes.echo',
  description: 'Echo text',
  signature: 'tools.notes.echo({\n  text: string,\n}): Promise<string>',
}

const lookup: CodeModeCatalog.Tool = {
  type: 'tool',
  name: 'orders.lookup',
  description: 'Look up an order',
  signature: 'tools.orders.lookup({\n  id: string,\n}): Promise<unknown>',
}

describe('CodeModeInstructions', () => {
  it.effect('instructs the model not to call execute while the catalog is empty', () =>
    Effect.gen(function* () {
      const initialized = yield* readInitial(CodeModeInstructions.make({tools: []}))
      expect(initialized.text).toBe(
        'No Code Mode tools are currently available. Later Code Mode catalog updates may add or remove tools. Do not call `execute_typescript` unless there is at least one available Code Mode tool.',
      )

      const added = yield* readUpdate(CodeModeInstructions.make({tools: [echo]}), initialized)
      expect(added.text).toContain('This catalog supersedes the previous Code Mode tool catalog.')
      expect(added.text).toContain(echo.signature)

      expect(yield* readUpdate(CodeModeInstructions.make({tools: []}), {values: added.values})).toMatchObject({
        text:
          'The Code Mode tool catalog has changed. This catalog supersedes the previous Code Mode tool catalog.\n\n' +
          'No Code Mode tools are currently available. Later Code Mode catalog updates may add or remove tools. Do not call `execute_typescript` unless there is at least one available Code Mode tool.',
      })
    }),
  )

  it.effect('renders the initial catalog, semantic deltas, and removal', () =>
    Effect.gen(function* () {
      const initialized = yield* readInitial(CodeModeInstructions.make({tools: [echo]}))
      expect(initialized.text).toContain(
        'The tools listed below cannot be called directly: they only work as JavaScript inside the `execute_typescript` tool.',
      )
      expect(initialized.text).toContain('The catalog is complete.')
      expect(initialized.text).toContain('## Code Mode tools (call only inside `execute_typescript`)')
      expect(initialized.text).toContain(`  - ${echo.signature} // Echo text`)

      const added = yield* readUpdate(CodeModeInstructions.make({tools: [echo, lookup]}), initialized)
      expect(added.text).toBe(
        `The Code Mode tool catalog has changed.\n\nNew tools are available:\n- orders (1 tool)\n  - ${lookup.signature} // Look up an order`,
      )

      const removed = yield* readUpdate(CodeModeInstructions.make({tools: [echo]}), {values: added.values})
      expect(removed.text).toBe(
        'The Code Mode tool catalog has changed.\n\n' +
          'The following tool namespaces are no longer available and must not be used: `orders`.',
      )

      expect(yield* readUpdate(CodeModeInstructions.make(), initialized)).toMatchObject({
        text: 'Code Mode tools are no longer available. Do not use any previously listed Code Mode tools.',
      })
    }),
  )
})
