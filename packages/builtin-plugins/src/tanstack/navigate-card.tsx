import {type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {InspectionCard, parseOutput} from './card-shared.js'

const NavigateResultSchema = z.object({to: z.string()}).loose()

function navigatedTo(result: string | undefined): string | undefined {
  const parsed = NavigateResultSchema.safeParse(parseOutput(result))
  return parsed.success ? parsed.data.to : undefined
}

function NavigateCard(props: ToolProps): JSX.Element {
  const summary = () => navigatedTo(props.output) ?? ''
  return <InspectionCard {...props} summary={summary()} />
}

export const navigateCard: ToolComponent = NavigateCard
