import {createDebouncer} from '@tanstack/solid-pacer'
import {For, onCleanup, untrack} from 'solid-js'
import type {CursorLook, Cursors} from './cursors.js'

const STILL_MS = 600
const STOP_HINT = 'Click again to stop me'
const TOOLTIP_LOOK =
  'rounded-chat-surface-sm bg-chat-panel text-chat-text border border-chat-line shadow-chat-lg py-1 px-2 text-[length:var(--chat-text-xs)] font-chat max-w-60'

type RegisterLook = (options: {element: HTMLElement; press?: () => void}) => void

function replay(options: {element: Element; name: string}): void {
  const {element, name: className} = options
  element.classList.remove(className)
  void element.getBoundingClientRect()
  element.classList.add(className)
}

function AgentLook(props: {register: RegisterLook}) {
  return (
    <div
      ref={(element) => props.register({element, press: () => replay({element, name: CLICKING_CLASS})})}
      class={CURSOR_CLASS}
      onAnimationEnd={(event) => event.currentTarget.classList.remove(SHAKE_CLASS)}
    >
      <div class={ARROW_CLASS} role="img" aria-label="Agent's cursor">
        <div class={RIPPLE_CLASS} />
        <div class={FILL_CLASS} />
        <div class={BORDER_CLASS} />
      </div>
      <div class={`${HINT_CLASS}  ${TOOLTIP_LOOK}`} role="status">
        {STOP_HINT}
      </div>
    </div>
  )
}

function Cursor(props: {id: string; look: CursorLook; cursors: Cursors}) {
  const id = untrack(() => props.id)
  const cursors = untrack(() => props.cursors)
  const still = createDebouncer(() => cursors.rest(id), {wait: STILL_MS})
  const register: RegisterLook = ({element, press}) => onCleanup(cursors.register({id, element, still, press}))
  return <AgentLook register={register} />
}

export function AimedCursors(props: {look: CursorLook; cursors: Cursors}) {
  return (
    <For each={props.cursors.aimed(props.look)}>
      {(id) => <Cursor id={id} look={props.look} cursors={props.cursors} />}
    </For>
  )
}

const CURSOR_FILL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
  </defs>
  <g xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(light-dark(rgba(0, 0, 0, 0.4), rgba(237, 237, 237, 0.4)) 3px 4px 4px);"><path d="M 15 42 L 15 36.99 Q 15 31.99 23.7 31.99 L 28.05 31.99 Q 32.41 31.99 32.41 21.99 L 32.41 17 Q 32.41 12 41.09 16.95 L 76.31 37.05 Q 85 42 76.31 46.95 L 41.09 67.05 Q 32.41 72 32.41 62.01 L 32.41 57.01 Q 32.41 52.01 23.7 52.01 L 19.35 52.01 Q 15 52.01 15 47.01 Z" fill="#ffffff" stroke="none" style="fill: #ffffff;"/></g>
</svg>
`

const CURSOR_BORDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  <g><path d="M 15 42 L 15 36.99 Q 15 31.99 23.7 31.99 L 28.05 31.99 Q 32.41 31.99 32.41 21.99 L 32.41 17 Q 32.41 12 41.09 16.95 L 76.31 37.05 Q 85 42 76.31 46.95 L 41.09 67.05 Q 32.41 72 32.41 62.01 L 32.41 57.01 Q 32.41 52.01 23.7 52.01 L 19.35 52.01 Q 15 52.01 15 47.01 Z" fill="none" stroke="#000000" stroke-width="6" stroke-miterlimit="10" style="stroke: light-dark(rgb(0, 0, 0), rgb(255, 255, 255));"/></g>
</svg>
`

function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export const MASK_CLASS = 'cv-sim-mask'
export const VISIBLE_CLASS = 'cv-sim-visible'
const CURSOR_CLASS = 'cv-sim-cursor'
const ARROW_CLASS = 'cv-sim-arrow'
const CLICKING_CLASS = 'cv-sim-clicking'
const RIPPLE_CLASS = 'cv-sim-ripple'
const FILL_CLASS = 'cv-sim-fill'
const BORDER_CLASS = 'cv-sim-border'
export const SHAKE_CLASS = 'cv-sim-shake'
export const HINT_CLASS = 'cv-sim-hint'
export const HINT_SHOWN_CLASS = 'cv-sim-hint-shown'

export const AGENT_BLUE = 'rgb(57, 182, 255)'
export const AGENT_PURPLE = 'rgb(189, 69, 251)'
const CURSOR_LAYER = 10000
const CURSOR_SIZE = 'calc(var(--chat-space) * 8)'
const SPACING_1 = 'var(--chat-space)'
const SPACING_2 = 'calc(var(--chat-space) * 2)'
const DURATION_SLOW = 'var(--chat-duration-slow)'
const DURATION_NORMAL = 'var(--chat-duration-normal)'
const EASE_OUT = 'var(--chat-ease)'
const EASE_IN_OUT = 'var(--chat-ease-in-out)'

export const SIMULATOR_CSS = `
.${MASK_CLASS} {
  position: fixed;
  inset: 0;
  z-index: -1;
  cursor: default;
  overflow: hidden;
  pointer-events: auto;
  display: none;
}
.${MASK_CLASS}.${VISIBLE_CLASS} {
  display: block;
}
.${CURSOR_CLASS} {
  position: absolute;
  top: 0;
  left: 0;
  width: ${CURSOR_SIZE};
  height: ${CURSOR_SIZE};
  pointer-events: none;
  z-index: ${CURSOR_LAYER};
  will-change: transform;
}
.${BORDER_CLASS} {
  position: absolute;
  width: 100%;
  height: 100%;
  background: linear-gradient(45deg, ${AGENT_BLUE}, ${AGENT_PURPLE});
  mask-image: ${svgUrl(CURSOR_BORDER)};
  mask-size: 100% 100%;
  mask-repeat: no-repeat;
  transform-origin: center;
  transform: rotate(-135deg) scale(1.2);
  margin-left: -13.333%;
  margin-top: -24%;
}
.${FILL_CLASS} {
  position: absolute;
  width: 100%;
  height: 100%;
  background: ${svgUrl(CURSOR_FILL)};
  background-size: 100% 100%;
  background-repeat: no-repeat;
  transform-origin: center;
  transform: rotate(-135deg) scale(1.2);
  margin-left: -13.333%;
  margin-top: -24%;
}
.${RIPPLE_CLASS} {
  position: absolute;
  width: 100%;
  height: 100%;
  pointer-events: none;
  margin-left: -50%;
  margin-top: -50%;
}
.${RIPPLE_CLASS}::after {
  content: '';
  opacity: 0;
  position: absolute;
  inset: 0;
  border: ${SPACING_1} solid ${AGENT_BLUE};
  border-radius: 50%;
}
.${CURSOR_CLASS}.${CLICKING_CLASS} .${RIPPLE_CLASS}::after {
  animation: cv-sim-ripple ${DURATION_SLOW} ${EASE_OUT} forwards;
}
.${CURSOR_CLASS}.${SHAKE_CLASS} {
  animation: cv-sim-shake ${DURATION_NORMAL} ${EASE_IN_OUT};
}
@media (prefers-reduced-motion: reduce) {
  .${CURSOR_CLASS}.${SHAKE_CLASS} {
    animation: none;
  }
}
@keyframes cv-sim-shake {
  0%, 100% {
    translate: 0;
  }
  25% {
    translate: calc(-1 * ${SPACING_1}) 0;
  }
  75% {
    translate: ${SPACING_1} 0;
  }
}
.${ARROW_CLASS} {
  position: absolute;
  inset: 0;
}
.${HINT_CLASS} {
  position: absolute;
  bottom: calc(100% + ${SPACING_2});
  left: 50%;
  translate: -50% 0;
  white-space: nowrap;
  visibility: hidden;
}
.${HINT_CLASS}.${HINT_SHOWN_CLASS} {
  visibility: visible;
}
@keyframes cv-sim-ripple {
  0% {
    transform: scale(0);
    opacity: 1;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}
`
