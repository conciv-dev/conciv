import {createHash} from 'node:crypto'
import {Redacted} from 'effect'
import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api'
import type * as Credential from '@conciv/protocol/schema/credential'

const fingerprint = (secret: Redacted.Redacted<string>) =>
  createHash('sha256').update(Redacted.value(secret)).digest('hex')

const readSecret = (value: Credential.Value) =>
  value.type === 'key' ? value.key : value.type === 'oauth' ? value.access : undefined

export default Plugin.define({
  id: 'figma-account',
  async setup(ctx) {
    await ctx.integration.transform((editor) => {
      editor.update('figma', (integration) => {
        integration.name = 'Figma'
      })
      editor.method.update({integrationId: 'figma', method: {type: 'key', label: 'Personal access token'}})
      editor.method.update({integrationId: 'figma', method: {type: 'env', names: ['FIGMA_API_KEY']}})
      editor.method.update({
        integrationId: 'figma',
        method: {id: 'oauth', type: 'oauth', label: 'Sign in with Figma'},
        authorize: async () => {
          throw new Error('figma sign-in is not part of this fixture')
        },
        refresh: async (credential) => ({
          ...credential,
          access: Redacted.make('figma-refreshed-access'),
          expires: Date.now() + 3_600_000,
        }),
      })
    })
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'figma_secret',
        description: 'Read the secret of the active Figma connection',
        input: z.object({}),
        output: z.object({kind: z.string(), fingerprint: z.string().nullable(), value: z.unknown()}),
        execute: async () => {
          const active = await ctx.integration.connection.active('figma')
          const value = active && (await ctx.integration.connection.resolve(active))
          const secret = value && readSecret(value)
          return {
            output: {
              kind: active?.type ?? 'none',
              fingerprint: secret ? fingerprint(secret) : null,
              value: value ?? null,
            },
          }
        },
      })
    })
  },
})
