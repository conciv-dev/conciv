import {type JSX} from 'solid-js'
import {mapKeys} from 'es-toolkit'
import {z} from 'zod'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import type {Method} from '@conciv/plugin-tanstack/rpc'
import {buildErrorsCard} from './build-errors-card.js'
import {InspectionCard, parseOutput, readInput, resultOk, tanstackOperation} from './card-shared.js'
import {loaderDataCard} from './loader-data-card.js'
import {queryCacheCard} from './query-cache-card.js'
import {routeManifestCard} from './route-manifest-card.js'
import {routerStateCard} from './router-state-card.js'
import {routeTreeCard} from './route-tree-card.js'
import {serverFnTraceCard} from './server-fn-trace-card.js'
import {tanstackToolName} from './tanstack-tool-names.js'

function BackCard(props: ToolProps): JSX.Element {
  return <InspectionCard {...props} summary="" />
}

const backCard: ToolComponent = BackCard

const NavigateResultSchema = z.object({to: z.string()}).loose()

function navigatedTo(result: string | undefined): string | undefined {
  const parsed = NavigateResultSchema.safeParse(parseOutput(result))
  return parsed.success ? parsed.data.to : undefined
}

function NavigateCard(props: ToolProps): JSX.Element {
  const summary = () => navigatedTo(props.output) ?? ''
  return <InspectionCard {...props} summary={summary()} />
}

const navigateCard: ToolComponent = NavigateCard

const InvalidateKeyInputSchema = tanstackOperation('query_invalidate').input.pick({key: true})

function QueryInvalidateCard(props: ToolProps): JSX.Element {
  const summary = () => {
    if (!resultOk(props.output)) return ''
    const input = readInput(InvalidateKeyInputSchema, props.input)
    return input?.key ?? ''
  }
  return <InspectionCard {...props} summary={summary()} />
}

const queryInvalidateCard: ToolComponent = QueryInvalidateCard

const RefetchKeyInputSchema = tanstackOperation('query_refetch').input.pick({key: true})

function QueryRefetchCard(props: ToolProps): JSX.Element {
  const summary = () => {
    if (!resultOk(props.output)) return ''
    const input = readInput(RefetchKeyInputSchema, props.input)
    return input?.key ?? ''
  }
  return <InspectionCard {...props} summary={summary()} />
}

const queryRefetchCard: ToolComponent = QueryRefetchCard

function RouterInvalidateCard(props: ToolProps): JSX.Element {
  return <InspectionCard {...props} summary="" />
}

const routerInvalidateCard: ToolComponent = RouterInvalidateCard

const operationCards = {
  router_state: routerStateCard,
  route_tree: routeTreeCard,
  loader_data: loaderDataCard,
  query_cache: queryCacheCard,
  query_invalidate: queryInvalidateCard,
  query_refetch: queryRefetchCard,
  navigate: navigateCard,
  router_invalidate: routerInvalidateCard,
  back: backCard,
} satisfies Partial<Record<Method, ToolComponent>>

export const tanstackCards = {
  ...mapKeys(operationCards, (_card, operation) => tanstackToolName(operation)),
  tanstack_build_errors: buildErrorsCard,
  tanstack_route_manifest: routeManifestCard,
  tanstack_server_fn_trace: serverFnTraceCard,
} satisfies Record<string, ToolComponent>
