import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Transcript } from './transcript';
import { Composer } from './composer';
import { AppPreview } from './app-preview';
import { GhostCursor } from './ghost-cursor';
import { useDemo } from './use-demo';
import { buildTurn, PICKABLES } from './demo-data';

const DEFAULT_PROMPT = 'make this bigger and green';

export function Demo() {
  const [state, dispatch] = useDemo();
  const [input, setInput] = useState('');

  const scope = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const grabRef = useRef<HTMLButtonElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  const reduced = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Ghost cursor glides to the grab pill on mount to teach the first click.
  useGSAP(
    () => {
      if (reduced() || !ghostRef.current || !grabRef.current) return;
      const root = scope.current!.getBoundingClientRect();
      const pill = grabRef.current.getBoundingClientRect();
      const x = pill.left - root.left + pill.width / 2;
      const y = pill.top - root.top + pill.height / 2;
      gsap
        .timeline({ delay: 0.8 })
        .set(ghostRef.current, { x: x - 60, y: y - 50 })
        .to(ghostRef.current, { autoAlpha: 1, duration: 0.3 })
        .to(ghostRef.current, { x, y, duration: 1, ease: 'power3.inOut' })
        .to(ghostRef.current, { scale: 0.82, duration: 0.16, yoyo: true, repeat: 1 })
        .to(ghostRef.current, { autoAlpha: 0, duration: 0.3 }, '+=0.2');
    },
    { scope },
  );

  // Pulse the grab pill while idle (not picking, nothing grabbed yet).
  useGSAP(
    () => {
      if (reduced() || !grabRef.current) return;
      if (state.picking || state.grabbed) return;
      const tween = gsap.to(grabRef.current, {
        boxShadow: '0 0 0 5px var(--od-accent-soft)',
        repeat: -1,
        yoyo: true,
        duration: 0.95,
        ease: 'sine.inOut',
      });
      return () => tween.kill();
    },
    { scope, dependencies: [state.picking, state.grabbed?.id] },
  );

  // Reveal the most recently added message.
  useGSAP(
    () => {
      if (reduced() || !viewportRef.current) return;
      const rows = viewportRef.current.querySelectorAll('.od-msg');
      const last = rows[rows.length - 1];
      if (last) gsap.from(last, { autoAlpha: 0, y: 8, duration: 0.35, ease: 'power2.out' });
      viewportRef.current.parentElement?.scrollTo({ top: viewportRef.current.scrollHeight });
    },
    { scope, dependencies: [state.messages.length] },
  );

  const onPick = (id: string) => {
    dispatch({ type: 'grab', pickable: PICKABLES[id] });
    setInput(DEFAULT_PROMPT);
  };

  const { contextSafe } = useGSAP({ scope });

  const onSend = contextSafe(() => {
    const text = input.trim();
    if (!text) return;
    const grabbedHtml = state.grabbed?.html;
    dispatch({ type: 'send', message: { kind: 'user', text, grabbedHtml } });
    setInput('');

    const tl = gsap.timeline();
    for (const beat of buildTurn(grabbedHtml ?? '')) {
      tl.add(() => {
        if (beat.message) dispatch({ type: 'push', message: beat.message });
        if (beat.patch) {
          dispatch({ type: 'patch' });
          if (ctaRef.current && !reduced()) {
            gsap.to(ctaRef.current, {
              height: 52,
              paddingLeft: 24,
              paddingRight: 24,
              fontSize: 15,
              backgroundColor: 'var(--od-pass)',
              boxShadow: '0 10px 24px -8px var(--od-pass)',
              duration: 0.5,
              ease: 'power2.out',
            });
          }
        }
      }, beat.at);
    }
  });

  return (
    <div className="relative" ref={scope}>
      <div
        className="pointer-events-none absolute -inset-3 -z-10 rounded-[28px] opacity-60 blur-2xl"
        style={{ background: 'radial-gradient(60% 60% at 70% 20%, var(--od-accent-soft), transparent)' }}
      />
      <Card className="overflow-hidden p-0 shadow-xl">
        <div className="flex items-center gap-2 border-b px-4 py-2.5">
          <span className="text-base text-primary">✦</span>
          <span className="text-[13.5px] font-semibold">opendui</span>
          <Badge className="bg-accent font-mono text-[10px] uppercase tracking-wide text-accent-foreground">
            in your app
          </Badge>
          <span className="ml-auto font-mono text-[12px] text-muted-foreground">live demo</span>
        </div>

        <div className="grid h-[460px] grid-cols-1 sm:grid-cols-2">
          <div className="flex min-h-0 flex-col border-r">
            <Transcript messages={state.messages} viewportRef={viewportRef} />
            <Composer
              grabbed={state.grabbed}
              picking={state.picking}
              value={input}
              onValueChange={setInput}
              onArm={() => dispatch({ type: 'arm', on: !state.picking })}
              onSend={onSend}
              grabRef={grabRef}
            />
          </div>
          <AppPreview picking={state.picking} patched={state.patched} onPick={onPick} ctaRef={ctaRef} />
        </div>
      </Card>

      <GhostCursor cursorRef={ghostRef} />
    </div>
  );
}
