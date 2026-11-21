import {describe, expect, test} from 'vitest'
import {CodeModeCatalog} from './catalog.js'
import {CodeModeInstructions} from './instructions.js'

describe('the code-mode catalog', () => {
  test.each([
    {
      case: 'a small catalog under the default budget lists every tool',
      pinned: false,
      budget: undefined,
      shown: [
        '- orders (2 tools)',
        '  - orders.lookup(id) // Look up an order',
        '  - orders.cancel(id) // Cancel an order',
      ],
      hidden: ['The catalog is partial.'],
    },
    {
      case: 'a zero budget keeps the namespace and lists no unpinned tool',
      pinned: false,
      budget: 0,
      shown: ['- orders (2 tools, none shown)', 'The catalog is partial.'],
      hidden: ['  - orders.lookup(id)', '  - orders.cancel(id)'],
    },
    {
      case: 'a pinned tool is listed even past the budget',
      pinned: true,
      budget: 0,
      shown: ['- orders (2 tools, 1 shown)', '  - orders.lookup(id) // Look up an order'],
      hidden: ['  - orders.cancel(id)'],
    },
  ])('$case', ({pinned, budget, shown, hidden}) => {
    const catalog = CodeModeCatalog.summarize(
      {
        tools: [
          {
            type: 'tool',
            name: 'orders.lookup',
            description: 'Look up an order',
            signature: 'orders.lookup(id)',
            pinned,
          },
          {type: 'tool', name: 'orders.cancel', description: 'Cancel an order', signature: 'orders.cancel(id)'},
        ],
      },
      budget === undefined ? {} : {budget},
    )

    const text = CodeModeInstructions.render(catalog)

    expect(catalog.total).toBe(2)
    for (const line of shown) expect(text).toContain(line)
    for (const line of hidden) expect(text).not.toContain(line)
  })

  test('only the first line of a long description is listed, cut to 120 characters', () => {
    const text = CodeModeInstructions.render(
      CodeModeCatalog.summarize({
        tools: [
          {
            type: 'tool',
            name: 'orders.lookup',
            description: `${'a'.repeat(130)}\nSecond line`,
            signature: 'orders.lookup(id)',
          },
        ],
      }),
    )

    expect(text).toContain(`  - orders.lookup(id) // ${'a'.repeat(117)}...`)
    expect(text).not.toContain('Second line')
  })
})
