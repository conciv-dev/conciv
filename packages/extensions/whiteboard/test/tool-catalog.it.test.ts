import {expect, test} from 'vitest'
import whiteboard from '../src/server.js'
import {getExtensionTestApi} from '@conciv/extension-testkit'
import {testHost} from './canvas-it-helpers.js'

const CODE_MODE_TOOLS = [
  'canvas_read',
  'canvas_svg',
  'canvas_preview',
  'canvas_export',
  'canvas_draw',
  'canvas_diagram',
  'canvas_connect',
  'canvas_update',
  'canvas_commit',
  'canvas_discard',
  'comment_create',
  'comment_reply',
  'comment_read',
  'comment_list',
  'comment_move',
  'pin_set_state',
  'anchor_resolve',
  'element_reference',
]

const APPROVAL_TOOLS = ['canvas_delete', 'canvas_clear', 'comment_resolve', 'comment_delete']

test('discover_tools offers the eighteen code-mode whiteboard tools and refuses the four approval tools', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    const offered = await api.discoverTools(CODE_MODE_TOOLS)
    expect(offered.errors).toBeUndefined()
    expect(offered.tools.map((tool) => tool.name)).toEqual(CODE_MODE_TOOLS.map((name) => `external_${name}`))
    for (const tool of offered.tools) expect(tool.description, tool.name).not.toBe('')
    const asking = await api.discoverTools(APPROVAL_TOOLS)
    expect(asking.tools).toEqual([])
    expect(asking.errors).toHaveLength(APPROVAL_TOOLS.length)
  } finally {
    await api.dispose()
  }
})

test('a thrown COMMENT_NOT_FOUND surfaces its declared code through the real call path', async () => {
  const api = await getExtensionTestApi({server: whiteboard, host: testHost})
  try {
    await expect(api.callTool('comment_read', {cid: 'nonexistent-cid'})).rejects.toThrow(/COMMENT_NOT_FOUND/)
  } finally {
    await api.dispose()
  }
})
