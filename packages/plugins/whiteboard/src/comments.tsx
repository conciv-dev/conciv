import {createContext, onCleanup, untrack, useContext, type Accessor, type JSX} from 'solid-js'
import {createCommentsModel, type ChatCover, type CommentsModel} from './comments-model.js'

const CommentsContext = createContext<CommentsModel>()

export function CommentsProvider(props: {
  room: Accessor<string>
  bindComments: (comments: ChatCover | undefined) => void
  children: JSX.Element
}): JSX.Element {
  const model = untrack(() => createCommentsModel(props.room))
  untrack(() =>
    props.bindComments({
      room: props.room(),
      threadOpen: model.threadOpen,
      inboxOpen: model.inboxOpen,
      prompting: model.prompting,
      addComment: model.addComment,
    }),
  )
  onCleanup(() => props.bindComments(undefined))
  return <CommentsContext.Provider value={model}>{props.children}</CommentsContext.Provider>
}

export function useComments(): CommentsModel {
  const model = useContext(CommentsContext)
  if (!model) throw new Error('useComments must be used inside a CommentsProvider')
  return model
}
