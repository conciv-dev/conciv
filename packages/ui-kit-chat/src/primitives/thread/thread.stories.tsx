import {createSignal, type JSX} from 'solid-js'
import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {expect, within, userEvent, waitFor} from 'storybook/test'
import {useChat, type UseChatReturn} from '@tanstack/ai-solid'
import type {ToolCardProps} from '@mandarax/protocol/tool-view-types'
import {ChatProvider} from '../../store/chat-context.js'
import {
  storyConnection,
  createTextChunks,
  createReasoningChunks,
  createToolCallChunks,
  type StoryConnectionOptions,
} from '../../store/story-connection.js'
import {Thread, type SuggestionData} from './thread.js'
import {Message} from '../message/message.js'

const meta: Meta = {title: 'primitives/Thread'}
export default meta
type Story = StoryObj

function FallbackTool(props: ToolCardProps): JSX.Element {
  return (
    <div class="text-[0.6875rem] text-pw-text-2 px-2 py-1 border border-pw-line rounded-pw-sm">
      tool {props.part.name} → {props.result?.content ? String(props.result.content) : '…'}
    </div>
  )
}

function UserMessage(): JSX.Element {
  return (
    <Message.Root class="text-pw-on-accent px-3 py-1.5 rounded-pw-md bg-pw-accent max-w-[80%] self-end">
      <Message.Parts />
    </Message.Root>
  )
}

function AssistantMessage(): JSX.Element {
  return (
    <Message.Root class="text-pw-text flex flex-col gap-1 max-w-full self-start">
      <Message.Parts components={{tools: {Fallback: FallbackTool}}} />
      <Message.Error />
    </Message.Root>
  )
}

// A live chat wired to the fake connection; `send` is exposed so play() drives the turn after mount
// (mutating chat state during render drops Solid subscriptions — always send from play/handlers).
function ThreadHarness(props: {options: StoryConnectionOptions; expose: (chat: UseChatReturn) => void}): JSX.Element {
  const chat = useChat({connection: storyConnection(props.options)})
  props.expose(chat)
  return (
    <ChatProvider chat={chat}>
      <Thread.Root class="flex flex-col gap-2">
        <Thread.Viewport class="flex flex-col gap-2 max-h-80 overflow-y-auto">
          <Thread.Empty>
            <div class="text-[0.8125rem] text-pw-text-3">Ask anything to begin.</div>
          </Thread.Empty>
          <Thread.Messages components={{UserMessage, AssistantMessage}} />
        </Thread.Viewport>
      </Thread.Root>
    </ChatProvider>
  )
}

export const StreamsAFullTurn: Story = {
  render: () => {
    const [chat, setChat] = createSignal<UseChatReturn>()
    const options: StoryConnectionOptions = {
      chunks: [
        ...createReasoningChunks('Checking the handler'),
        ...createToolCallChunks('read', {path: 'app.ts'}, {result: 'ok'}),
        ...createTextChunks('Found it — add the missing await.'),
      ],
      chunkDelay: 2,
    }
    return (
      <div>
        <button type="button" data-send onClick={() => void chat()?.sendMessage('why is it broken?')}>
          ask
        </button>
        <ThreadHarness options={options} expose={setChat} />
      </div>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText('ask'))
    await waitFor(() => expect(c.getByText('why is it broken?')).toBeVisible())
    await waitFor(() => expect(c.getByText(/Found it — add the missing await\./)).toBeVisible(), {timeout: 4000})
    await waitFor(() => expect(c.getByText(/tool read/)).toBeVisible())
  },
}

export const EmptyState: Story = {
  render: () => <ThreadHarness options={{}} expose={() => {}} />,
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await expect(c.getByText('Ask anything to begin.')).toBeVisible()
  },
}

const STARTERS: SuggestionData[] = [
  {title: 'Explain', label: 'this error', prompt: 'Explain this error'},
  {title: 'Add a test', label: 'for the bug', prompt: 'Add a test for the bug'},
]

export const SuggestionsSendOnClick: Story = {
  render: () => {
    const chat = useChat({connection: storyConnection({chunks: createTextChunks('On it.'), chunkDelay: 1})})
    return (
      <ChatProvider chat={chat}>
        <Thread.Root class="flex flex-col gap-2">
          <Thread.Viewport class="flex flex-col gap-2">
            <Thread.Empty>
              <div class="flex gap-2">
                <Thread.Suggestions
                  each={STARTERS}
                  components={{
                    Suggestion: (props) => (
                      <Thread.Suggestion
                        prompt={props.suggestion.prompt}
                        send
                        class="text-[0.75rem] text-pw-text-2 px-2 py-1 border border-pw-line rounded-pw-md"
                      >
                        {props.suggestion.title} {props.suggestion.label}
                      </Thread.Suggestion>
                    ),
                  }}
                />
              </div>
            </Thread.Empty>
            <Thread.Messages components={{UserMessage, AssistantMessage}} />
          </Thread.Viewport>
        </Thread.Root>
      </ChatProvider>
    )
  },
  play: async ({canvasElement}) => {
    const c = within(canvasElement)
    await userEvent.click(c.getByText(/Explain this error/))
    await waitFor(() => expect(c.getByText('Explain this error')).toBeVisible())
    await waitFor(() => expect(c.getByText('On it.')).toBeVisible(), {timeout: 4000})
  },
}
