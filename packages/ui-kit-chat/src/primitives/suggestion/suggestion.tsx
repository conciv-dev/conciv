import {createContext, splitProps, useContext, type Accessor, type JSX} from 'solid-js'
import {useChatContext, useComposer} from '../../store/chat-context.js'
import {Primitive} from '../util/primitive.js'
import {reportUnsent, useComposerHandlers} from '../composer/composer-handlers.js'
import {chatKitErrors} from '@conciv/errors'

export type SuggestionData = {title: string; label: string; prompt: string}

const SuggestionContext = createContext<Accessor<SuggestionData>>()

export const SuggestionProvider = SuggestionContext.Provider

export function useSuggestion(): Accessor<SuggestionData> {
  const context = useContext(SuggestionContext)
  if (!context) throw chatKitErrors.OUTSIDE_PROVIDER({part: 'Suggestion.*', provider: 'a Thread.Suggestions item'})
  return context
}

function Title(props: JSX.HTMLAttributes<HTMLSpanElement>): JSX.Element {
  const suggestion = useSuggestion()
  return <Primitive.span {...props}>{props.children ?? suggestion().title}</Primitive.span>
}

function Description(props: JSX.HTMLAttributes<HTMLSpanElement>): JSX.Element {
  const suggestion = useSuggestion()
  return <Primitive.span {...props}>{props.children ?? suggestion().label}</Primitive.span>
}

type TriggerProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {send?: boolean; clearComposer?: boolean}

function Trigger(props: TriggerProps): JSX.Element {
  const suggestion = useSuggestion()
  const chat = useChatContext()
  const composer = useComposer()
  const handlers = useComposerHandlers()
  const [local, rest] = splitProps(props, ['send', 'clearComposer', 'onClick'])
  const activate = (event: MouseEvent & {currentTarget: HTMLButtonElement; target: Element}) => {
    if (typeof local.onClick === 'function') local.onClick(event)
    if (local.clearComposer !== false) composer.setText('')
    if (local.send) {
      void chat
        .sendMessage(suggestion().prompt)
        .catch((error: unknown) => (handlers.onSendError ?? reportUnsent)(error))
      return
    }
    composer.setText(suggestion().prompt)
  }
  return <button type="button" onClick={activate} {...rest} />
}

export const Suggestion = {Title, Description, Trigger}
