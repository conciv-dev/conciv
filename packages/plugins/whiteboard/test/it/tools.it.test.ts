import {execFile} from 'node:child_process'
import {relative} from 'node:path'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {describe} from 'vitest'
import {test} from '@conciv/backend-test-utils'
import {z} from 'zod'
import {TestLLM} from '@conciv/backend-test-utils'
import {humanSourceComment} from '../utils/human-source-comment.js'

describe.concurrent('the agent is told about the whiteboard', () => {
  test('the model request lists the whiteboard skill and the whiteboard tool namespace', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    await engine.reply(TestLLM.text('I can draw that on the whiteboard'))
    await engine.session.send('Sketch the login flow')

    const [request] = await engine.requests()
    const system = request?.system.join('\n')
    expect(system).toContain('    <id>whiteboard</id>')
    expect(system).toContain(
      '    <description>Draw on the Excalidraw canvas shared with the user and leave comments on it, pinned to the canvas or anchored to source. Load it before your first whiteboard tool call.</description>',
    )
    expect(system).toContain('- whiteboard (22 tools')
    expect(system).toContain(
      'The Excalidraw canvas shared with the user: draw into a hidden draft and commit it, leave comments pinned to the canvas or anchored to source, and check those anchors.',
    )
  })
})

describe.concurrent('the agent works a comment thread on the board', () => {
  test('a comment takes a reply, reads back with its thread, lists alone, its pin moves and floats, and resolving and deleting ask the user first; deleting a reply keeps the thread, deleting the root takes its pin', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    const room = engine.session.id

    expect(
      await engine.session.tool('whiteboard_comment_create').call({
        cid: 'hero-note',
        kind: 'floating',
        parts: [{type: 'text', text: 'Make the hero bigger'}],
        x: 120,
        y: 80,
        authorKind: 'ai',
        authorModel: 'claude-test',
      }),
    ).toEqual({cid: 'hero-note'})
    const reply = z
      .object({cid: z.string()})
      .parse(
        await engine.session
          .tool('whiteboard_comment_reply')
          .call({cid: 'hero-note', parts: [{type: 'text', text: 'Done, it is twice the size now'}]}),
      )
    expect(reply.cid).not.toBe('hero-note')

    expect(await engine.session.tool('whiteboard_comment_read').call({cid: 'hero-note'})).toMatchObject({
      comment: {
        cid: 'hero-note',
        threadId: 'hero-note',
        parentId: null,
        status: 'open',
        authorKind: 'ai',
        parts: [{type: 'text', text: 'Make the hero bigger'}],
      },
      replies: [
        {
          cid: reply.cid,
          threadId: 'hero-note',
          parentId: 'hero-note',
          authorKind: 'ai',
          parts: [{type: 'text', text: 'Done, it is twice the size now'}],
        },
      ],
    })
    expect(await engine.session.tool('whiteboard_comment_list').call({})).toMatchObject({
      comments: [{cid: 'hero-note'}],
    })
    const human = {
      ...humanSourceComment('human-answer', {anchor: null, anchorFile: null, anchorComponent: null, anchorHash: null}),
      threadId: 'hero-note',
      parentId: 'hero-note',
      kind: 'floating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parts: [
        {type: 'text', text: 'On it '},
        {type: 'mention', id: 'claude-test', label: 'claude-test'},
      ],
    }
    await engine.rpc.call('whiteboard', 'comments.insert', {room, row: human})
    expect(await engine.session.tool('whiteboard_comment_read').call({cid: 'hero-note'})).toMatchObject({
      replies: [
        {cid: reply.cid},
        {
          authorKind: 'human',
          parts: expect.arrayContaining([expect.objectContaining({type: 'mention', label: 'claude-test'})]),
        },
      ],
    })
    expect(await engine.rpc.call('whiteboard', 'comments.remove', {room, id: human.id})).toEqual({deleted: true})
    expect(await engine.session.tool('whiteboard_comment_list').call({status: 'resolved'})).toEqual({comments: []})
    expect(await engine.session.tool('whiteboard_comment_read').failure({cid: 'no-such-note'})).toMatchObject({
      message: expect.stringContaining('comment no-such-note not found'),
    })

    expect(await engine.session.tool('whiteboard_comment_move').call({cid: 'hero-note', x: 300, y: 200})).toEqual({
      cid: 'hero-note',
      x: 300,
      y: 200,
    })
    expect(await engine.rpc.call('whiteboard', 'pins.list', {room})).toMatchObject([
      {cid: 'hero-note', x: 300, y: 200, pinState: 'locked'},
    ])
    expect(await engine.session.tool('whiteboard_pin_set_state').call({cid: 'hero-note', pinState: 'offset'})).toEqual({
      cid: 'hero-note',
      pinState: 'offset',
    })
    expect(await engine.rpc.call('whiteboard', 'pins.list', {room})).toMatchObject([
      {cid: 'hero-note', x: 300, y: 200, pinState: 'offset'},
    ])
    expect(
      await engine.session.tool('whiteboard_comment_move').failure({cid: 'no-such-note', x: 1, y: 1}),
    ).toMatchObject({message: expect.stringContaining('no pin for comment no-such-note')})

    const [resolved] = await Promise.all([
      engine.session.tool('whiteboard_comment_resolve').call({cid: 'hero-note'}),
      engine.session.approve(),
    ])
    expect(resolved).toEqual({cid: 'hero-note', status: 'resolved'})
    expect(await engine.session.tool('whiteboard_comment_list').call({status: 'resolved'})).toMatchObject({
      comments: [{cid: 'hero-note', status: 'resolved'}],
    })

    const [replyDeleted] = await Promise.all([
      engine.session.tool('whiteboard_comment_delete').call({cid: reply.cid}),
      engine.session.approve(),
    ])
    expect(replyDeleted).toEqual({cid: reply.cid, deleted: true})
    expect(await engine.session.tool('whiteboard_comment_read').call({cid: 'hero-note'})).toMatchObject({
      comment: {cid: 'hero-note'},
      replies: [],
    })

    const [rootDeleted] = await Promise.all([
      engine.session.tool('whiteboard_comment_delete').call({cid: 'hero-note'}),
      engine.session.approve(),
    ])
    expect(rootDeleted).toEqual({cid: 'hero-note', deleted: true})
    expect(await engine.session.tool('whiteboard_comment_list').call({})).toEqual({comments: []})
    expect(await engine.rpc.call('whiteboard', 'pins.list', {room})).toEqual([])
  })
})

describe.concurrent('a source-linked comment follows its element as the code changes', () => {
  test('the agent finds a component, anchors a comment to it, and the anchor reads fresh, moved, ambiguous, then orphaned or drifted', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    const room = engine.session.id
    await engine.write(
      'src/Cart.tsx',
      [
        'export function Cart() {',
        '  return (',
        '    <section>',
        '      <h2>Your cart</h2>',
        '      <button>Checkout</button>',
        '    </section>',
        '  )',
        '}',
        '',
      ].join('\n'),
    )

    expect(
      await engine.session.tool('whiteboard_element_reference').call({file: 'src/Cart.tsx', component: 'Cart'}),
    ).toEqual({found: true, file: 'src/Cart.tsx', line: 3, column: 5})
    expect(
      await engine.session.tool('whiteboard_element_reference').call({file: 'src/Cart.tsx', component: 'button'}),
    ).toEqual({found: true, file: 'src/Cart.tsx', line: 5, column: 7})
    expect(
      await engine.session.tool('whiteboard_element_reference').call({file: 'src/Cart.tsx', component: 'Wishlist'}),
    ).toEqual({found: false})

    await engine.session.tool('whiteboard_comment_create').call({
      cid: 'checkout-note',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'Make checkout the primary action'}],
      anchor: {source: {file: 'src/Cart.tsx', line: 5, column: 7}},
      x: 10,
      y: 10,
      authorKind: 'ai',
    })
    const fresh = await engine.session.tool('whiteboard_anchor_resolve').call({cid: 'checkout-note'})
    expect(fresh).toMatchObject({
      status: 'fresh',
      anchor: {
        source: {
          file: 'src/Cart.tsx',
          line: 5,
          column: 7,
          component: 'Cart',
          snippet: '<button>Checkout</button>',
          commit: null,
        },
      },
    })
    const placed = z.object({anchor: z.object({source: z.object({hash: z.string()}).catchall(z.json())})}).parse(fresh)
    await engine.rpc.call('whiteboard', 'comments.insert', {
      room,
      row: humanSourceComment('checkout-human', {
        anchor: {source: placed.anchor.source, instance: {selector: 'main > section > button'}},
        anchorFile: 'src/Cart.tsx',
        anchorComponent: 'Cart',
        anchorHash: placed.anchor.source.hash,
      }),
    })

    await engine.write(
      'src/Cart.tsx',
      [
        'export function Cart() {',
        '  return (',
        '    <section>',
        '      <p>Free shipping</p>',
        '      <h2>Your cart</h2>',
        '      <button>Checkout</button>',
        '    </section>',
        '  )',
        '}',
        '',
      ].join('\n'),
    )
    expect(await engine.session.tool('whiteboard_anchor_resolve').call({cid: 'checkout-note'})).toMatchObject({
      status: 'moved',
      anchor: {source: {file: 'src/Cart.tsx', line: 6, column: 7, snippet: '<button>Checkout</button>'}},
    })

    await engine.write(
      'src/Cart.tsx',
      [
        'export function Cart() {',
        '  return (',
        '    <section>',
        '      <p>Free shipping</p>',
        '      <h2>Your cart</h2>',
        '      <button>Checkout</button>',
        '      <button>Save for later</button>',
        '    </section>',
        '  )',
        '}',
        '',
      ].join('\n'),
    )
    expect(await engine.session.tool('whiteboard_anchor_resolve').call({cid: 'checkout-note'})).toMatchObject({
      status: 'ambiguous',
      candidates: [
        {source: {line: 6, column: 7, snippet: '<button>Checkout</button>'}},
        {source: {line: 7, column: 7, snippet: '<button>Save for later</button>'}},
      ],
    })

    await engine.write(
      'src/Cart.tsx',
      [
        'export function Cart() {',
        '  return (',
        '    <section>',
        '      <h2>Your cart</h2>',
        '      <a href="/checkout">Checkout</a>',
        '    </section>',
        '  )',
        '}',
        '',
      ].join('\n'),
    )
    const diff = {before: '<button>Checkout</button>', after: '<a href="/checkout">Checkout</a>'}
    expect(await engine.session.tool('whiteboard_anchor_resolve').call({cid: 'checkout-note'})).toEqual({
      status: 'orphaned',
      diff,
    })
    expect(await engine.session.tool('whiteboard_anchor_resolve').call({cid: 'checkout-human'})).toEqual({
      status: 'drifted',
      diff,
    })

    await engine.session.tool('whiteboard_comment_create').call({
      cid: 'loose-note',
      kind: 'floating',
      parts: [{type: 'text', text: 'Not tied to any code'}],
      x: 0,
      y: 0,
      authorKind: 'ai',
    })
    expect(await engine.session.tool('whiteboard_anchor_resolve').call({cid: 'loose-note'})).toEqual({
      status: 'orphaned',
    })
  })
})

describe.concurrent('in a git project a source-linked comment records the commit it was made on', () => {
  test('the anchor records HEAD, and after a committed edit moves the element it reads moved at its new line', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']}, {git: true})
    const cart = [
      'export function Cart() {',
      '  return (',
      '    <section>',
      '      <h2>Your cart</h2>',
      '      <button>Checkout</button>',
      '    </section>',
      '  )',
      '}',
      '',
    ]
    await engine.write('src/Cart.tsx', cart.join('\n'))
    await engine.commit('add the cart')
    const {stdout: head} = await promisify(execFile)('git', ['rev-parse', 'HEAD'], {cwd: engine.root})

    await engine.session.tool('whiteboard_comment_create').call({
      cid: 'checkout-note',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'Make checkout the primary action'}],
      anchor: {source: {file: 'src/Cart.tsx', line: 5, column: 7}},
      x: 10,
      y: 10,
      authorKind: 'ai',
    })
    expect(await engine.session.tool('whiteboard_anchor_resolve').call({cid: 'checkout-note'})).toMatchObject({
      status: 'fresh',
      anchor: {source: {file: 'src/Cart.tsx', line: 5, column: 7, commit: head.trim()}},
    })

    await engine.write(
      'src/Cart.tsx',
      [...cart.slice(0, 3), '      <p>Free shipping</p>', '      <p>Returns within 30 days</p>', ...cart.slice(3)].join(
        '\n',
      ),
    )
    await engine.commit('add the shipping notes')

    expect(await engine.session.tool('whiteboard_anchor_resolve').call({cid: 'checkout-note'})).toMatchObject({
      status: 'moved',
      anchor: {source: {file: 'src/Cart.tsx', line: 7, column: 7, snippet: '<button>Checkout</button>'}},
    })
  })
})

describe.concurrent('a human comment on a source element gets its source details from the engine', () => {
  test('a human comment that names only a file and line is given its component, snippet and hash', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    const room = engine.session.id
    await engine.write(
      'src/Cart.tsx',
      [
        'export function Cart() {',
        '  return (',
        '    <section>',
        '      <button>Checkout</button>',
        '    </section>',
        '  )',
        '}',
        '',
      ].join('\n'),
    )

    const enriched = await engine.event('rpc.whiteboard.changed', {
      data: {room, table: 'comments', key: 'button-human-row', cursor: 2},
    })
    await engine.rpc.call('whiteboard', 'comments.insert', {
      room,
      row: humanSourceComment('button-human', {
        anchor: {source: {file: 'src/Cart.tsx', line: 4, column: 7}, instance: {selector: 'main > section > button'}},
        anchorFile: null,
        anchorComponent: null,
        anchorHash: null,
      }),
    })
    await enriched.arrived

    expect(await engine.rpc.call('whiteboard', 'comments.get', {room, id: 'button-human-row'})).toMatchObject({
      anchorFile: 'src/Cart.tsx',
      anchorComponent: 'Cart',
      anchorHash: expect.stringMatching(/^[0-9a-f]{8}$/),
      anchor: {
        source: {file: 'src/Cart.tsx', line: 4, column: 7, component: 'Cart', snippet: '<button>Checkout</button>'},
        instance: {selector: 'main > section > button'},
      },
    })
    expect(await engine.session.tool('whiteboard_anchor_resolve').call({cid: 'button-human'})).toMatchObject({
      status: 'fresh',
    })
  })
})

describe.concurrent('a draft left when a turn ends is sent to be published', () => {
  test('the turn ends with a draft on the board and the engine queues one commit for the canvas, never a second', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    const room = engine.session.id
    await engine.rpc.call('whiteboard', 'elements.upsert', {
      room,
      scope: 'draft',
      row: {elementId: 'draft-box', data: {type: 'rectangle', x: 0, y: 0, width: 80, height: 40}, version: 1},
    })
    await engine.reply(TestLLM.text('I sketched the box'), TestLLM.text('Still sketching'))

    const queued = await engine.event('rpc.whiteboard.changed', {data: {room, table: 'canvasPending', type: 'upsert'}})
    await engine.session.send('Sketch a box')
    await queued.arrived
    expect(await engine.rpc.call('whiteboard', 'canvasPending.list', {room})).toMatchObject([
      {room, kind: 'commit', stage: 'live', payload: {}},
    ])

    await engine.session.send('Keep going')
    expect(await engine.rpc.call('whiteboard', 'canvasPending.list', {room})).toMatchObject([{kind: 'commit'}])
  })
})

describe.concurrent('anchors never leak secrets or reach outside the project', () => {
  test('a snippet has its secrets redacted, a secret file keeps no snippet, and a file outside the project is not read', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    await engine.write(
      'src/Billing.tsx',
      ['export function Billing() {', '  return <div data-key="sk_live_abcdefgh1234">Pay now</div>', '}', ''].join(
        '\n',
      ),
    )
    await engine.write('config/.env.tsx', ['export const Env = () => <p>API_TOKEN=abc123</p>', ''].join('\n'))

    await engine.session.tool('whiteboard_comment_create').call({
      cid: 'billing-note',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'Pay now needs a total'}],
      anchor: {source: {file: 'src/Billing.tsx', line: 2, column: 10}},
      x: 0,
      y: 0,
      authorKind: 'ai',
    })
    expect(await engine.session.tool('whiteboard_comment_read').call({cid: 'billing-note'})).toMatchObject({
      comment: {anchor: {source: {file: 'src/Billing.tsx', snippet: '<div data-key="[redacted]">Pay now</div>'}}},
    })

    await engine.session.tool('whiteboard_comment_create').call({
      cid: 'env-note',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'Why is this rendered?'}],
      anchor: {source: {file: 'config/.env.tsx', line: 1, column: 26}},
      x: 0,
      y: 0,
      authorKind: 'ai',
    })
    expect(await engine.session.tool('whiteboard_comment_read').call({cid: 'env-note'})).toMatchObject({
      comment: {anchor: {source: {file: 'config/.env.tsx', component: 'Env', snippet: ''}}},
    })

    const outside = fileURLToPath(new URL('../fixtures/outside-project/billing.jsx', import.meta.url))
    const climbing = relative(engine.root, outside)
    expect(
      await engine.session.tool('whiteboard_element_reference').call({file: outside, component: 'Billing'}),
    ).toEqual({found: false})
    expect(
      await engine.session.tool('whiteboard_element_reference').call({file: climbing, component: 'Billing'}),
    ).toEqual({found: false})
    await engine.session.tool('whiteboard_comment_create').call({
      cid: 'outside-note',
      kind: 'source-linked',
      parts: [{type: 'text', text: 'Look at this form'}],
      anchor: {source: {file: climbing, line: 2, column: 10}},
      x: 0,
      y: 0,
      authorKind: 'ai',
    })
    expect(await engine.session.tool('whiteboard_anchor_resolve').call({cid: 'outside-note'})).toEqual({
      status: 'orphaned',
    })
  })
})

describe.concurrent('with no canvas open, the canvas tools answer without waiting on one', () => {
  test('preview and commit have nothing to work on, drawing and png export fail, bad svg and oversized diagrams are refused, a commit with no tab times out and keeps its draft, update, delete and read work on the published board, and a draw a canvas tab takes is pending and its commit after the tab left times out and keeps the draft', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({
      plugins: [['@conciv/plugin-whiteboard', {drawDeadlineMs: 50, exportDeadlineMs: 50, commitDeadlineMs: 50}]],
    })

    expect(await engine.session.tool('whiteboard_canvas_preview').call({})).toEqual({
      empty: true,
      reason: 'draft has no elements yet',
    })
    expect(await engine.session.tool('whiteboard_canvas_commit').call({})).toEqual({
      committed: false,
      reason: 'no draft to commit',
    })

    expect(await engine.session.tool('whiteboard_canvas_export').failure({format: 'png'})).toMatchObject({
      message: expect.stringContaining(
        'export timed out: no canvas tab is connected (whiteboard_canvas_preview works without one)',
      ),
    })
    const noCanvas =
      'no canvas is open to draw into, so nothing was drawn: ask the user to open the canvas from the Whiteboard pill above the composer, then draw again'
    expect(
      await engine.session
        .tool('whiteboard_canvas_draw')
        .failure({elements: [{type: 'rectangle', x: 0, y: 0, width: 100, height: 50}]}),
    ).toMatchObject({message: expect.stringContaining(noCanvas)})
    expect(
      await engine.session.tool('whiteboard_canvas_connect').failure({fromId: 'box-a', toId: 'box-b'}),
    ).toMatchObject({message: expect.stringContaining(noCanvas)})

    expect(
      await engine.session
        .tool('whiteboard_canvas_svg')
        .failure({svg: '<g><rect width="10" height="10"/></g>', x: 0, y: 0}),
    ).toMatchObject({message: expect.stringContaining('markup must have an <svg> root')})
    expect(
      await engine.session
        .tool('whiteboard_canvas_svg')
        .failure({svg: '<svg><script>alert(1)</script><rect width="10" height="10"/></svg>', x: 0, y: 0}),
    ).toMatchObject({message: expect.stringContaining('script elements are not allowed')})
    expect(
      await engine.session.tool('whiteboard_canvas_diagram').failure({
        mermaid: ['graph TD', ...Array.from({length: 501}, (_, edge) => `A${edge} --> B${edge}`)].join('\n'),
      }),
    ).toMatchObject({message: expect.stringContaining('diagram exceeds 500 edges')})

    const room = engine.session.id
    await engine.rpc.call('whiteboard', 'elements.upsert', {
      room,
      scope: 'draft',
      row: {elementId: 'draft-box', data: {type: 'rectangle', x: 0, y: 0, width: 80, height: 40}, version: 1},
    })
    expect(await engine.session.tool('whiteboard_canvas_commit').failure({})).toMatchObject({
      message: expect.stringContaining('commit timed out: no canvas tab is connected to perform it'),
    })
    expect(await engine.session.tool('whiteboard_canvas_read').call({scope: 'draft'})).toMatchObject({
      scope: 'draft',
      elements: [{type: 'rectangle'}],
    })
    expect(await engine.session.tool('whiteboard_canvas_discard').call({})).toEqual({discarded: 1})

    await engine.rpc.call('whiteboard', 'elements.bulkUpsert', {
      room,
      scope: 'live',
      rows: [
        {elementId: 'cart', data: {id: 'cart', type: 'rectangle', x: 0, y: 0}, version: 1},
        {elementId: 'pay', data: {id: 'pay', type: 'rectangle', x: 240, y: 0}, version: 1},
        {elementId: 'cart-pay', data: {id: 'cart-pay', type: 'arrow', x: 120, y: 30}, version: 1},
      ],
    })
    expect(
      await engine.session
        .tool('whiteboard_canvas_update')
        .call({elementId: 'cart', patch: {backgroundColor: '#ffc9c9'}}),
    ).toEqual({updated: true})
    expect(await engine.session.tool('whiteboard_canvas_update').call({elementId: 'gone', patch: {x: 1}})).toEqual({
      updated: false,
    })
    const [deleted] = await Promise.all([
      engine.session.tool('whiteboard_canvas_delete').call({elementId: 'pay'}),
      engine.session.approve(),
    ])
    expect(deleted).toEqual({deleted: 'pay'})
    const live = await engine.session.tool('whiteboard_canvas_read').call({scope: 'live'})
    expect(live).toHaveProperty('elements.length', 2)
    expect(live).toMatchObject({
      scope: 'live',
      elements: expect.arrayContaining([
        expect.objectContaining({id: 'cart', backgroundColor: '#ffc9c9'}),
        expect.objectContaining({type: 'arrow'}),
      ]),
    })

    const withTab = await createEngine({
      plugins: [['@conciv/plugin-whiteboard', {drawDeadlineMs: 10_000, commitDeadlineMs: 50}]],
    })
    const board = withTab.session.id
    const box = {type: 'rectangle', x: 0, y: 0, width: 80, height: 40}
    const asked = await withTab.event('rpc.whiteboard.changed', {
      data: {room: board, table: 'canvasPending', type: 'upsert'},
    })
    const drawn = withTab.session.tool('whiteboard_canvas_draw').call({elements: [{...box, id: 'tab-box'}]})
    const {key} = z.object({key: z.string()}).parse((await asked.arrived).data)
    expect(await withTab.rpc.call('whiteboard', 'canvasPending.claim', {room: board, id: key})).toEqual({claimed: true})
    await withTab.rpc.call('whiteboard', 'elements.upsert', {
      room: board,
      scope: 'draft',
      row: {elementId: 'tab-box', data: {...box, id: 'tab-box'}, version: 1},
    })
    await withTab.rpc.call('whiteboard', 'canvasPending.remove', {room: board, id: key})
    expect(await drawn).toHaveProperty('pending')
    expect(await withTab.session.tool('whiteboard_canvas_commit').failure({})).toMatchObject({
      message: expect.stringContaining('commit timed out: no canvas tab is connected to perform it'),
    })
    expect(await withTab.session.tool('whiteboard_canvas_read').call({scope: 'draft'})).toMatchObject({
      scope: 'draft',
      elements: [{id: 'tab-box', type: 'rectangle'}],
    })
  })
})

describe.concurrent('the board lives in the engine state', () => {
  test('comments and canvas elements are still there after the engine restarts', async ({createEngine, expect}) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    const room = engine.session.id
    await engine.session.tool('whiteboard_comment_create').call({
      cid: 'kept-note',
      kind: 'floating',
      parts: [{type: 'text', text: 'Keep this across restarts'}],
      x: 5,
      y: 5,
      authorKind: 'ai',
    })
    await engine.rpc.call('whiteboard', 'elements.upsert', {
      room,
      scope: 'live',
      row: {elementId: 'kept-box', data: {type: 'rectangle', x: 0, y: 0, width: 80, height: 40}, version: 1},
    })

    await engine.restart()

    expect(await engine.session.tool('whiteboard_comment_list').call({})).toMatchObject({
      comments: [{cid: 'kept-note', parts: [{type: 'text', text: 'Keep this across restarts'}]}],
    })
    expect(await engine.session.tool('whiteboard_canvas_read').call({})).toEqual({
      elements: [{type: 'rectangle', x: 0, y: 0, width: 80, height: 40}],
      scope: 'live',
    })
  })
})

describe.concurrent("a canvas tab keeps the board through the plugin's rpc", () => {
  test('rows are written, read, conflicted, claimed and removed, each change is announced and since replays them', async ({
    createEngine,
    expect,
  }) => {
    const engine = await createEngine({plugins: ['@conciv/plugin-whiteboard']})
    const room = engine.session.id
    const pin = {
      id: 'pin-1',
      cid: 'hero-note',
      x: 10,
      y: 20,
      elementId: null,
      pinState: 'locked',
      anchorX: null,
      anchorY: null,
    }

    const changed = await engine.event('rpc.whiteboard.changed')
    expect(await engine.rpc.call('whiteboard', 'pins.insert', {room, row: pin})).toEqual({...pin, room})
    expect(await changed.arrived).toMatchObject({
      type: 'rpc.whiteboard.changed',
      data: {room, table: 'pins', key: 'pin-1', type: 'upsert', cursor: 1},
    })
    expect(await engine.rpc.call('whiteboard', 'pins.update', {room, id: 'pin-1', patch: {x: 40}})).toEqual({
      ...pin,
      room,
      x: 40,
    })
    expect(await engine.rpc.call('whiteboard', 'pins.get', {room, id: 'pin-1'})).toEqual({...pin, room, x: 40})
    expect(await engine.rpc.failure('whiteboard', 'pins.get', {room, id: 'missing'})).toEqual({
      type: 'NOT_FOUND',
      message: 'no pin missing in this room',
      data: {id: 'missing'},
    })

    const box = {elementId: 'box-1', data: {type: 'rectangle', x: 0, y: 0}, version: 1}
    expect(await engine.rpc.call('whiteboard', 'elements.upsert', {room, scope: 'live', row: box})).toEqual({
      ...box,
      room,
    })
    expect(
      await engine.rpc.failure('whiteboard', 'elements.upsert', {
        room,
        scope: 'live',
        row: {...box, data: {type: 'ellipse', x: 0, y: 0}},
      }),
    ).toEqual({type: 'CONFLICT', message: 'element version conflict', data: {current: {...box, room}}})

    const drafts = [
      {elementId: 'draft-1', data: {type: 'text', x: 0, y: 0}, version: 1},
      {elementId: 'draft-2', data: {type: 'arrow', x: 0, y: 0}, version: 1},
    ]
    expect(await engine.rpc.call('whiteboard', 'elements.bulkUpsert', {room, scope: 'draft', rows: drafts})).toEqual({
      rows: drafts.map((row) => ({...row, room})),
    })
    expect(
      await engine.rpc.call('whiteboard', 'elements.bulkDelete', {
        room,
        scope: 'draft',
        elementIds: ['draft-1', 'draft-2', 'never-drawn'],
      }),
    ).toEqual({deleted: 2})

    await engine.rpc.call('whiteboard', 'canvasPending.insert', {
      room,
      row: {id: 'commit-1', kind: 'commit', stage: 'live', payload: {}},
    })
    expect(await engine.rpc.call('whiteboard', 'canvasPending.claim', {room, id: 'commit-1'})).toEqual({claimed: true})
    expect(await engine.rpc.call('whiteboard', 'canvasPending.claim', {room, id: 'commit-1'})).toEqual({
      claimed: false,
    })

    expect(await engine.rpc.call('whiteboard', 'pins.remove', {room, id: 'pin-1'})).toEqual({deleted: true})
    expect(await engine.rpc.call('whiteboard', 'pins.remove', {room, id: 'pin-1'})).toEqual({deleted: false})

    expect(await engine.rpc.call('whiteboard', 'since', {room, cursor: 5})).toEqual({
      changes: [
        {table: 'canvasDraftElements', key: 'draft-1', type: 'delete', cursor: 6},
        {table: 'canvasDraftElements', key: 'draft-2', type: 'delete', cursor: 7},
        {table: 'canvasPending', key: 'commit-1', type: 'upsert', cursor: 8},
        {table: 'pins', key: 'pin-1', type: 'delete', cursor: 9},
      ],
      cursor: 9,
    })

    const cursorMoved = await engine.event('rpc.whiteboard.cursor')
    expect(
      await engine.rpc.call('whiteboard', 'cursor.move', {
        room,
        cursor: {peerId: 'peer-ada', kind: 'human', x: 5, y: 6, name: 'Ada', color: '#ff0000', lastSeen: 0},
      }),
    ).toEqual({ok: true})
    expect(await cursorMoved.arrived).toMatchObject({
      type: 'rpc.whiteboard.cursor',
      data: {room, peerId: 'peer-ada', kind: 'human', x: 5, y: 6, name: 'Ada'},
    })
  })
})
