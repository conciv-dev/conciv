import type {TraceItem} from '@conciv/ui-kit-chat/tools'
import {ToolDisplay} from '@conciv/ui-kit-chat/tools'
import type {StoryCall} from '../page/cards/story.fixtures.js'
import {whiteboardFailedCard} from './card-shared.js'
import {whiteboardCards} from './cards.js'

function whiteboardEntry(name: string) {
  const render = Object.entries(whiteboardCards).find(([tool]) => tool === name)?.[1]
  return {render, errorComponent: whiteboardFailedCard}
}

export function whiteboardRow(call: StoryCall): TraceItem {
  return {
    key: call.id,
    render: () => <ToolDisplay {...call} defaultOpen={call.status !== 'error'} render={whiteboardEntry} />,
  }
}
