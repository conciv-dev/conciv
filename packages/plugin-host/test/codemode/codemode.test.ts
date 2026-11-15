import {describe, expect, test} from 'vitest'
import {Effect, Schema} from 'effect'
import {toolExpression} from '../../src/codemode/index.js'
import {makeSearchTool, prepare, type VisibleTool} from '../../src/codemode/tool-runtime.js'

const signature = (path: string, input = '{\n  id: string,\n}', output = 'string') =>
  `${toolExpression(path)}(${input}): Promise<${output}>`

const tool = (
  path: string,
  description: string,
  parameters: ReadonlyArray<string> = ['id'],
  namespaces: ReadonlyArray<{readonly description?: string}> = [],
  rendered = signature(path),
): VisibleTool => ({
  description: {path, description, signature: rendered},
  parameters,
  namespaces,
})

const search = (tools: ReadonlyArray<VisibleTool>, input: unknown) => {
  const searchTool = makeSearchTool(prepare(tools))
  return Effect.runPromise(Schema.decodeUnknownEffect(searchTool.input)(input).pipe(Effect.flatMap(searchTool.execute)))
}

const paths = async (tools: ReadonlyArray<VisibleTool>, input: unknown) =>
  (await search(tools, input)).items.map((item) => item.path)

const lookup = tool(
  'orders.lookup',
  'Look up an order by ID',
  ['id'],
  [],
  signature('orders.lookup', '{\n  id: string,\n}', '{\n  id: string,\n  status: string,\n}'),
)

describe('CodeMode search', () => {
  test('describes the catalog and keeps the search built-in registered', async () => {
    expect(await search([lookup], {query: 'order'})).toStrictEqual({
      items: [
        {
          path: 'external_orders_lookup',
          description: 'Look up an order by ID',
          signature: lookup.description.signature,
        },
      ],
      remaining: 0,
      next: null,
    })
  })

  test('uses one ranked search returning complete tools for large catalogs', async () => {
    const tools = [
      tool('thread.uploadFile', 'Upload one readable local file to the current Discord thread', ['path']),
      tool('thread.generateImage', 'Generate an image and upload it to the current Discord thread', ['prompt']),
      lookup,
    ]
    expect(
      await search(tools, {query: 'send message attachment upload file to current Discord thread', limit: 2}),
    ).toStrictEqual({
      items: [
        {
          path: 'external_thread_uploadFile',
          description: 'Upload one readable local file to the current Discord thread',
          signature: signature('thread.uploadFile'),
        },
        {
          path: 'external_thread_generateImage',
          description: 'Generate an image and upload it to the current Discord thread',
          signature: signature('thread.generateImage'),
        },
      ],
      remaining: 0,
      next: null,
    })
    expect((await paths(tools, {query: 'file'}))[0]).toBe('external_thread_uploadFile')
    expect((await paths(tools, {query: 'image'}))[0]).toBe('external_thread_generateImage')
  })

  test('search defaults to 10 results and resolves exact tool paths', async () => {
    const tools = Array.from({length: 14}, (_, index) => tool(`many.tool${index}`, `Numbered tool ${index}`))
    const browse = await search(tools, {})
    expect(browse.items).toHaveLength(10)
    expect(browse.remaining).toBe(4)
    expect(browse.next).toStrictEqual({offset: 10})
    for (const query of ['many.tool13', 'tools.many.tool13', 'external_many_tool13']) {
      expect(await search(tools, {query})).toStrictEqual({
        items: [
          {
            path: 'external_many_tool13',
            description: 'Numbered tool 13',
            signature: signature('many.tool13'),
          },
        ],
        remaining: 0,
        next: null,
      })
    }
  })

  test('scopes search to one namespace and browses it alphabetically', async () => {
    const tools = [
      tool('github.list_issues', 'List issues'),
      tool('github.create_issue', 'Create an issue'),
      tool('linear.list_issues', 'List Linear issues'),
    ]
    const browse = await search(tools, {query: '', namespace: 'github'})
    expect(browse.remaining).toBe(0)
    expect(browse.items.map((item) => item.path)).toStrictEqual([
      'external_github_create_issue',
      'external_github_list_issues',
    ])
    const scoped = await search(tools, {query: 'issues', namespace: 'linear'})
    expect(scoped.remaining).toBe(0)
    expect(scoped.items[0]?.path).toBe('external_linear_list_issues')
    expect((await search(tools, {query: '', namespace: 'tools.github'})).items).toHaveLength(2)
    await expect(search(tools, {query: 'issues', namespace: 7})).rejects.toThrow()
  })

  test('matches input parameter names and partial-word substrings', async () => {
    const tools = [
      tool('files.upload', 'Send a document to the workspace', ['attachment']),
      tool('files.other', 'Rename the workspace', ['name']),
    ]
    const byParameter = await search(tools, {query: 'attachment'})
    expect(byParameter.remaining).toBe(0)
    expect(byParameter.items[0]?.path).toBe('external_files_upload')
    const bySubstring = await search(tools, {query: 'docum'})
    expect(bySubstring.remaining).toBe(0)
    expect(bySubstring.items[0]?.path).toBe('external_files_upload')
  })

  test('a query term matches whole words, not substrings', async () => {
    const tools = [
      tool('cloudflare.get_timezones', 'List timezones', []),
      tool('cloudflare.get_zones', 'List zones', []),
    ]
    expect(await paths(tools, {query: 'zones'})).toStrictEqual(['external_cloudflare_get_zones'])
  })

  test('search indexes are shared only between runtimes with the same tool text', async () => {
    const top = async (tools: ReadonlyArray<VisibleTool>, query: string) => (await paths(tools, {query}))[0]
    const first = [tool('mail.send', 'Send an email', []), tool('mail.archive', 'Archive a thread', [])]
    const reordered = [tool('mail.archive', 'Archive a thread', []), tool('mail.send', 'Send an email', [])]
    const changed = [tool('mail.send', 'Archive a thread', []), tool('mail.archive', 'Send an email', [])]
    expect(await top(first, 'email')).toBe('external_mail_send')
    expect(await top(reordered, 'email')).toBe('external_mail_send')
    expect(await top(changed, 'email')).toBe('external_mail_archive')
    expect(await top(first, 'archive thread')).toBe('external_mail_archive')
  })

  test('search ranks by rare words, prefers short names and matches partial words', async () => {
    const tools = [
      tool('gmail.list_labels', 'List the labels in the mailbox', []),
      tool('gmail.list_messages', 'List messages', []),
      tool('slack.list_channels', 'List channels', []),
      tool('slack.list_users', 'List users', []),
      tool('slack.list_user_groups', 'List user groups', []),
      tool('slack.get_schedules', 'Get scheduled messages', []),
    ]
    expect((await paths(tools, {query: 'list gmail labels'}))[0]).toBe('external_gmail_list_labels')
    expect((await paths(tools, {query: 'users', namespace: 'slack'}))[0]).toBe('external_slack_list_users')
    expect(await paths(tools, {query: 'schedu'})).toStrictEqual(['external_slack_get_schedules'])
    const short = [
      tool('cloud.describe_vm', 'Describe a virtual machine', []),
      tool('cloud.list_all_issues', 'List issues', []),
    ]
    expect((await paths(short, {query: 'vms'}))[0]).toBe('external_cloud_describe_vm')
    expect(await paths(short, {query: 'all'})).toStrictEqual(['external_cloud_list_all_issues'])
    expect(await paths(tools, {query: 'labels', namespace: 'slack'})).toStrictEqual([])
  })

  test('a plural query term matches singular-only tool text', async () => {
    const tools = [
      tool('tracker.fetch_all', 'Fetch every open issue in the project'),
      tool('github.list_issues', 'List issues'),
      tool('misc.rename', 'Rename the workspace'),
    ]
    const plural = await search(tools, {query: 'issues', namespace: 'tracker'})
    expect(plural.remaining).toBe(0)
    expect(plural.items[0]?.path).toBe('external_tracker_fetch_all')
    const ranked = await search(tools, {query: 'issues'})
    expect(ranked.remaining).toBe(0)
    expect(ranked.items.map((item) => item.path)).toStrictEqual([
      'external_github_list_issues',
      'external_tracker_fetch_all',
    ])
  })

  test('empty query lists everything alphabetically by path', async () => {
    const tools = [tool('zeta.last', 'Last', []), tool('alpha.beta', 'Middle', []), tool('alpha.aardvark', 'First', [])]
    const browse = await search(tools, {})
    expect(browse.items.map((item) => item.path)).toStrictEqual([
      'external_alpha_aardvark',
      'external_alpha_beta',
      'external_zeta_last',
    ])
    expect(browse.remaining).toBe(0)
    expect(browse.next).toBeNull()
    expect(await search(tools, {limit: 1, offset: 1})).toMatchObject({
      items: [{path: 'external_alpha_beta'}],
      remaining: 1,
      next: {offset: 2},
    })
    expect(await search(tools, {limit: 1, offset: 3})).toStrictEqual({items: [], remaining: 0, next: null})
  })

  test('rejects invalid search limits', async () => {
    await expect(search([lookup], {query: 'order', limit: 0.5})).rejects.toThrow()
    for (const offset of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1']) {
      await expect(search([lookup], {query: 'order', offset})).rejects.toThrow()
    }
  })
})

describe('CodeMode search over tool paths', () => {
  test('search scopes to a nested namespace subtree', async () => {
    const tools = [
      tool('slack.admin', 'Admin', []),
      tool('slack.admin.invite', 'Invite', []),
      tool('slack.admin.users.list', 'List users', []),
      tool('slack.administrator.list', 'List administrators', []),
      tool('slack.read', 'Read Slack', []),
    ]
    expect(await paths(tools, {query: '', namespace: 'slack.admin'})).toEqual([
      'external_slack_admin',
      'external_slack_admin_invite',
      'external_slack_admin_users_list',
    ])
  })

  test('search returns executable paths for both a callable namespace and its child', async () => {
    const tools = [tool('issues', 'All issues', []), tool('issues.list', 'List issues', [])]
    expect(await paths(tools, {query: '', namespace: 'issues'})).toEqual(['external_issues', 'external_issues_list'])
    expect(await paths(tools, {query: 'tools.issues.list'})).toEqual(['external_issues_list'])
  })

  test('search matches descriptions from every enclosing namespace', async () => {
    const workspace = {description: 'Manage the workspace'}
    const tools = [
      tool('api.users.list', 'List users', [], [workspace, {description: 'Directory and account administration'}]),
      tool('api.status', 'Read service status', [], [workspace]),
      tool('plain.read', 'Read plain data', []),
    ]
    expect(await paths(tools, {query: 'workspace'})).toEqual(['external_api_status', 'external_api_users_list'])
    expect(await paths(tools, {query: 'account administration'})).toEqual(['external_api_users_list'])
  })
})

describe('CodeMode search signatures', () => {
  const listIssues = tool(
    'github.list_issues',
    'List issues in a repository',
    ['owner', 'after', 'perPage', 'labels', 'state'],
    [],
    signature('github.list_issues', '{\n  /** Repository owner */\n  owner: string,\n}', 'unknown'),
  )
  const orders = tool(
    'orders.lookup',
    'Look up an order',
    ['id', 'verbose'],
    [],
    signature('orders.lookup', '{\n  /** Order identifier */\n  id: string,\n}', '{\n  status: string,\n}'),
  )

  test('a ranked or exact-path search returns the entry signature unchanged', async () => {
    const tools = [listIssues, orders]
    const found = await search(tools, {query: 'list issues repository'})
    expect(found.items.find(({path}) => path === 'external_github_list_issues')?.signature).toBe(
      listIssues.description.signature,
    )
    for (const query of ['look up order', 'tools.orders.lookup', 'external_orders_lookup']) {
      const {items} = await search(tools, {query})
      expect(items.find(({path}) => path === 'external_orders_lookup')?.signature).toBe(orders.description.signature)
    }
  })
})
