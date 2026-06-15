export type Pickable = {
  id: string;
  html: string;
  where: string;
};

// The sample "your app" elements that can be grabbed, with react-grab-style references.
export const PICKABLES: Record<string, Pickable> = {
  heading: { id: 'heading', html: '<h3>Welcome back</h3>', where: 'HomePage at routes/index.tsx:12:5' },
  sub: { id: 'sub', html: '<p class="sub">Sign in to continue</p>', where: 'HomePage at routes/index.tsx:13:5' },
  cta: { id: 'cta', html: '<button class="cta">Get started</button>', where: 'HomePage at routes/index.tsx:19:7' },
};

export type Message =
  | { kind: 'agent'; text: string }
  | { kind: 'user'; text: string; grabbedHtml?: string }
  | { kind: 'think'; text: string }
  | { kind: 'tool'; label: string; detail: string }
  | { kind: 'result'; text: string };

// The scripted agent turn after the user sends. `at` is seconds on the gsap timeline.
// `patch` flips the live preview element at that beat.
export type Beat = { at: number; message?: Message; patch?: boolean };

export const GREETING: Message = {
  kind: 'agent',
  text: "Hi — I'm running inside this page. Grab any element and tell me what to change.",
};

export function buildTurn(grabbedHtml: string): Beat[] {
  return [
    { at: 0.5, message: { kind: 'think', text: 'thought for 0.4s' } },
    { at: 1.0, message: { kind: 'agent', text: 'On it — patching the element you grabbed.' } },
    { at: 1.6, message: { kind: 'tool', label: 'inspect', detail: 'button.cta' } },
    { at: 2.3, message: { kind: 'tool', label: 'patch', detail: 'height 40 → 52 · bg → emerald' } },
    { at: 2.5, patch: true },
    { at: 2.9, message: { kind: 'result', text: 'done — 1 element changed, saved to source' } },
  ];
}
