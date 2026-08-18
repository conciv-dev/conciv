export const TURN_MEASURE_CLASS = 'w-full max-w-[68ch]'

export const TURN_INDENT_CLASS = 'ps-[var(--chat-trace-gutter)]'

export const PROMPT_ROOT_CLASS = `relative flex items-start gap-0 min-w-0 self-stretch anim-msg ${TURN_MEASURE_CLASS}`

export const PROMPT_GUTTER_CLASS =
  'flex-none select-none w-[var(--chat-trace-gutter)] text-[12.5px] leading-[1.55] [font-family:var(--chat-mono)] text-chat-accent'

export const PROMPT_TEXT_CLASS =
  'flex-1 min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] text-[12.5px] leading-[1.55] [font-family:var(--chat-mono)] text-chat-prompt'

export const PROMPT_TIME_CLASS =
  'flex-none self-start text-end tabular-nums text-[10px] leading-[1.75] [font-family:var(--chat-mono)] text-chat-faint'

export const ASSISTANT_ROOT_CLASS = `flex flex-col gap-1.5 min-w-0 pb-[22px] [color:var(--chat-text)] self-stretch relative anim-msg ${TURN_MEASURE_CLASS}`

export const ANSWER_ROW_CLASS = `flex min-w-0 w-full pt-[6px] ${TURN_INDENT_CLASS}`

export const ANSWER_ACTION_ROW_CLASS = `absolute bottom-0 start-0 flex items-start pointer-events-none ${TURN_INDENT_CLASS}`

export const ANSWER_CONTENT_CLASS = 'min-w-0 text-[14px] leading-[1.6] [text-wrap:pretty] text-chat-text'

export const ANSWER_CONTENT_SETTLED_CLASS =
  'min-w-0 text-[14px] leading-[1.6] [text-wrap:pretty] text-chat-body-settled'
