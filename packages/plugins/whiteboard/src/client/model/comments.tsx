import {createContext, onCleanup, untrack, useContext, type Accessor, type JSX} from 'solid-js'
import {createCommentsModel, type CommentsModel} from './comments-model.js'

const CommentsContext = createContext<CommentsModel>()

export function CommentsProvider(props: {
  room: Accessor<string>
  bindThreadOpen: (threadOpen: Accessor<boolean>) => void
  children: JSX.Element
}): JSX.Element {
  const model = untrack(() => createCommentsModel(props.room))
  untrack(() => props.bindThreadOpen(model.threadOpen))
  onCleanup(() => props.bindThreadOpen(() => false))
  return <CommentsContext.Provider value={model}>{props.children}</CommentsContext.Provider>
}

export function useComments(): CommentsModel {
  const model = useContext(CommentsContext)
  if (!model) throw new Error('useComments must be used inside a CommentsProvider')
  return model
}
