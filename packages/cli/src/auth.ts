import {z} from 'zod'
import {argument, command, description, name, route, schema, toggle} from '@bomb.sh/router'
import {makeRpcClient} from '@conciv/contract'
import {readTrustedBrowsers, revokeBrowsers} from '@conciv/protocol/engine-trust'
import {envelopeFlag, type CliOutcome} from './envelope.js'
import {discoveredEngine, scopedOrigin} from './engine-origin.js'
import {userFailure} from './failure.js'
import {engineAnswer} from './request.js'
import {handler} from './router/handler.js'

const LOGIN_LINK_PARAM = 'conciv_otp'

const PageUrlSchema = z
  .string()
  .refine((value) => URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'expected an http or https page URL',
  })

export type RevokeOptions = {id?: string; all: boolean; cwd: string}

export type LinkOptions = {url: string; cwd: string}

function localEngine(cwd: string): NonNullable<ReturnType<typeof discoveredEngine>> {
  const engine = discoveredEngine(cwd)
  if (engine === undefined) {
    throw userFailure('no conciv engine state found here or in any parent directory', {
      hint: 'run this inside a project that has run the conciv dev server (it writes .conciv/server.json)',
    })
  }
  return engine
}

export async function runLink(options: LinkOptions): Promise<CliOutcome> {
  const engine = localEngine(options.cwd)
  if (engine.token === undefined) {
    throw userFailure('the conciv engine state holds no engine token', {
      hint: 'restart the conciv dev server so it rewrites .conciv/server.json',
    })
  }
  const origin = scopedOrigin(engine.port, engine.token)
  const issued = await engineAnswer(origin, makeRpcClient(origin).auth.issueCode())
  const link = new URL(options.url)
  const fragment = new URLSearchParams(link.hash.replace(/^#/, ''))
  fragment.set(LOGIN_LINK_PARAM, issued.code)
  link.hash = fragment.toString()
  return {report: 'json', data: {link: link.href, expiresAt: issued.expiresAt}}
}

export function runRevoke(options: RevokeOptions): CliOutcome {
  const engine = localEngine(options.cwd)
  if (options.all) return {report: 'json', data: {revoked: revokeBrowsers(engine.stateDir, 'all'), trusted: []}}
  if (options.id === undefined)
    return {report: 'json', data: {revoked: [], trusted: readTrustedBrowsers(engine.stateDir)}}
  const revoked = revokeBrowsers(engine.stateDir, {id: options.id})
  if (revoked.length === 0) {
    throw userFailure(`no trusted browser has the id "${options.id}"`, {
      hint: 'run `conciv auth revoke` without an id to list the trusted browsers',
    })
  }
  return {report: 'json', data: {revoked, trusted: readTrustedBrowsers(engine.stateDir)}}
}

const RevokeModelSchema = z.object({id: z.string().optional(), all: z.boolean()})

const revokeCommand = command(
  name('revoke'),
  description('Stop trusting a browser that logged in to the conciv engine.'),
  argument(name('id'), description('the browser id to revoke; omit it to list them'), schema(z.string().optional())),
  toggle(name('all'), description('revoke every trusted browser')),
  envelopeFlag,
  handler((model) => runRevoke({...RevokeModelSchema.parse(model), cwd: process.cwd()})),
)

const LinkModelSchema = z.object({url: PageUrlSchema})

const linkCommand = command(
  name('link'),
  description('Print a one-time login link for a page served with the conciv dev server.'),
  argument(
    name('url'),
    description('the page URL to log in, for example http://localhost:3001/'),
    schema(PageUrlSchema),
  ),
  envelopeFlag,
  handler((model) => runLink({...LinkModelSchema.parse(model), cwd: process.cwd()})),
)

export const authRoute = route(
  name('auth'),
  description('Manage the browsers trusted by the conciv engine.'),
  envelopeFlag,
  revokeCommand,
  linkCommand,
)
