import {type JSX} from 'solid-js'
import {Thread as ThreadPrimitive} from '../primitives/thread/thread.js'
import type {SuggestionData} from '../primitives/suggestion/suggestion.js'
import {FOCUS} from './classes.js'

// assistant-ui's ThreadFollowupSuggestions: a row of pill prompts shown only on a settled, non-empty
// thread. Our model has no store-side thread.suggestions, so the host passes them in (§7).
const PILL = `rounded-[var(--chat-radius-pill)] [border:1px_solid_var(--chat-line)] px-3 py-1 text-[length:var(--chat-text-md)] [color:var(--chat-text-2)] [background:var(--chat-bg)] cursor-pointer [transition:background_140ms_var(--chat-ease),color_140ms_var(--chat-ease)] hover:[background:var(--chat-fill-strong)] hover:[color:var(--chat-text-hi)] ${FOCUS}`

export function FollowUpSuggestions(props: {suggestions: SuggestionData[]}): JSX.Element {
  return (
    <ThreadPrimitive.If empty={false} running={false}>
      <div class="flex flex-wrap gap-2 min-h-8 items-center justify-center anim-presence-in">
        <ThreadPrimitive.Suggestions each={props.suggestions}>
          {(suggestion) => (
            <ThreadPrimitive.Suggestion prompt={suggestion().prompt} send class={PILL}>
              {suggestion().prompt}
            </ThreadPrimitive.Suggestion>
          )}
        </ThreadPrimitive.Suggestions>
      </div>
    </ThreadPrimitive.If>
  )
}
