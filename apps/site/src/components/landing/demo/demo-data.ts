export type Scenario = {
  prompt: string
  inspect: string
  patchDetail: string
  apply: Record<string, string | number>
}

export type Pickable = {
  id: string
  html: string
  where: string
  scenarios: Scenario[]
}

export const PICKABLES: Record<string, Pickable> = {
  heading: {
    id: 'heading',
    html: '<h3>Welcome back</h3>',
    where: 'HomePage at routes/index.tsx:12:5',
    scenarios: [
      {
        prompt: 'make the heading bigger and red',
        inspect: 'h3 · "Welcome back"',
        patchDetail: 'font-size 20 → 30 · color → red',
        apply: {fontSize: 30, color: 'var(--od-accent)'},
      },
      {
        prompt: 'make the heading heavier and tighter',
        inspect: 'h3 · "Welcome back"',
        patchDetail: 'weight 700 → 800 · tracking → -0.04em',
        apply: {fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em'},
      },
    ],
  },
  sub: {
    id: 'sub',
    html: '<p class="sub">Sign in to continue</p>',
    where: 'HomePage at routes/index.tsx:13:5',
    scenarios: [
      {
        prompt: 'make the subtitle italic and a bit softer',
        inspect: 'p.sub',
        patchDetail: 'font-style → italic · opacity → 0.7',
        apply: {fontStyle: 'italic', opacity: 0.7},
      },
      {
        prompt: 'make the subtitle red',
        inspect: 'p.sub',
        patchDetail: 'color → red',
        apply: {color: 'var(--od-accent)'},
      },
    ],
  },
  cta: {
    id: 'cta',
    html: '<button class="cta">Get started</button>',
    where: 'HomePage at routes/index.tsx:19:7',
    scenarios: [
      {
        prompt: 'make the Get started button bigger and green',
        inspect: 'button.cta',
        patchDetail: 'height 40 → 52 · bg → emerald',
        apply: {
          height: 52,
          paddingLeft: 24,
          paddingRight: 24,
          fontSize: 15,
          backgroundColor: 'var(--od-pass)',
          boxShadow: '0 10px 24px -8px var(--od-pass)',
        },
      },
      {
        prompt: 'change the text to "Let\'s go" and make it bold',
        inspect: 'button.cta',
        patchDetail: 'text → "Let\'s go" · weight → 700',
        apply: {fontWeight: 700},
      },
    ],
  },
}

export type Message =
  | {kind: 'agent'; text: string}
  | {kind: 'user'; text: string; grabbedHtml?: string}
  | {kind: 'think'; text: string}
  | {kind: 'tool'; label: string; detail: string}
  | {kind: 'result'; text: string}

export type Beat = {at: number; message?: Message; patch?: boolean}

export const GREETING: Message = {
  kind: 'agent',
  text: "Hi — I'm running inside this page. Grab any element and tell me what to change.",
}

export function buildTurn(scenario: Scenario): Beat[] {
  return [
    {at: 0.5, message: {kind: 'think', text: 'thought for 0.4s'}},
    {at: 1.0, message: {kind: 'agent', text: 'On it — patching the element you grabbed.'}},
    {at: 1.6, message: {kind: 'tool', label: 'inspect', detail: scenario.inspect}},
    {at: 2.3, message: {kind: 'tool', label: 'patch', detail: scenario.patchDetail}},
    {at: 2.5, patch: true},
    {at: 2.9, message: {kind: 'result', text: 'done — 1 element changed, saved to source'}},
  ]
}

export function pickScenario(pickable: Pickable): Scenario {
  return pickable.scenarios[Math.floor(Math.random() * pickable.scenarios.length)]
}
