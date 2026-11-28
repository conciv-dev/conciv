import {Effect, FileSystem, Path, Ref} from 'effect'
import {HttpClient} from 'effect/http'
import type {EvlogError} from 'evlog'
import {uniqBy} from 'es-toolkit'
import * as Tool from '@conciv/protocol/schema/tool'
import type {Context} from '@conciv/backend-plugin-api/effect/plugin'
import type {Design} from '../model/design.js'
import {designErrors} from '../errors/errors.js'
import {loadFigma} from '../sources/figma.js'
import type {AssetFolders} from '../sources/figma-assets.js'
import {readFigmaKey} from '../sources/figma-key.js'
import {figmaRef, parseFigmaLink} from '../sources/figma-link.js'
import {GetInputSchema, GetReplySchema, type GetInput} from './get-schema.js'
import {renderDocument, variantRule} from './document.js'

type Target = {
  readonly id: string
  readonly ref: string
  readonly route: string | undefined
  readonly design: Design
  readonly notes: readonly string[]
}

type SessionTargets = {readonly targets: readonly Target[]; readonly current: readonly string[]}

const DESCRIPTION =
  'Returns the design to build from a Figma frame link for the page at route, the path of the page you are building: every node of the frame with its id, box, paint, text, auto layout, the groups its layout implies and how it reflows at narrower widths, plus the rules the page must follow. The first call registers the frame as the design of the page; later calls return the stored design. With several links, one frame per width, each frame is registered and the reply holds one design per frame in variants.'

const EMPTY: SessionTargets = {targets: [], current: []}

export const registerDesignGet = Effect.fn('design.registerDesignGet')(function* (input: {
  ctx: Pick<Context, 'tool' | 'integration'>
  folders: AssetFolders
}) {
  const {ctx, folders} = input
  const services = yield* Effect.context<HttpClient.HttpClient | FileSystem.FileSystem | Path.Path>()
  const sessions = yield* Ref.make<Readonly<Record<string, SessionTargets>>>({})

  const resolve = Effect.fn('design.resolveTargets')(function* (query: GetInput, known: SessionTargets) {
    const links = linkList(query.figma)
    if (links.length === 0) {
      const current = known.targets.filter((target) => known.current.includes(target.id))
      if (current.length === 0) return yield* Effect.fail(designErrors.NO_TARGET())
      return current
    }
    return yield* Effect.forEach(links, (link) =>
      Effect.gen(function* () {
        const parsed = parseFigmaLink(link)
        if (parsed === null) return yield* Effect.fail(designErrors.FIGMA_LINK())
        const found = known.targets.find((target) => target.ref === figmaRef(parsed))
        if (found !== undefined) return found
        const key = yield* readFigmaKey(ctx)
        const loaded = yield* loadFigma({...folders, link: parsed, key})
        const target: Target = {
          id: loaded.design.id,
          ref: loaded.design.source.ref,
          route: undefined,
          design: loaded.design,
          notes: loaded.warnings,
        }
        return target
      }),
    )
  })

  const get = Effect.fn('design.get')(function* (query: GetInput, sessionId: string) {
    const known = (yield* Ref.get(sessions))[sessionId] ?? EMPTY
    const resolved = yield* resolve(query, known).pipe(Effect.provideContext(services))
    const routed = resolved.map((target) => (query.route === undefined ? target : {...target, route: query.route}))
    yield* Ref.update(sessions, (all) => {
      const before = all[sessionId] ?? EMPTY
      const targets = uniqBy([...routed, ...before.targets], (target) => target.ref)
      return {...all, [sessionId]: {targets, current: routed.map((target) => target.id)}}
    })
    const documents = routed.map((target) => renderDocument({target: target.id, design: target.design}))
    const [only] = documents
    if (documents.length === 1 && only !== undefined) return only
    const widths = documents.map((document) => document.viewport.width)
    return {variants: documents.map((design) => ({...design, rules: [...design.rules, variantRule({design, widths})]}))}
  })

  yield* ctx.tool.transform((editor) => {
    editor.namespace({name: 'design', description: 'The Figma design of the page the agent builds.'})
    editor.add({
      name: 'get',
      description: DESCRIPTION,
      input: GetInputSchema,
      output: GetReplySchema,
      options: {namespace: 'design'},
      execute: (query, tool) =>
        get(query, tool.sessionId).pipe(
          Effect.map((output) => ({output})),
          Effect.mapError(toolFailure),
        ),
    })
  })
})

function toolFailure(failure: EvlogError): Tool.Error {
  const message = failure.fix === undefined ? failure.message : `${failure.message}. ${failure.fix}`
  return Tool.toolError({message, metadata: {code: failure.code}})
}

function linkList(figma: GetInput['figma']): readonly string[] {
  if (figma === undefined) return []
  return typeof figma === 'string' ? [figma] : figma
}
