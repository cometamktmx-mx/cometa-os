import { useRef, useState, type PointerEvent } from "react";
import { usePosLayout } from "../responsive";
import { onboardingSlides } from "./slides";
import "./onboarding.css";

const paths: Record<string, string> = {
  sale: "M4 5h16v14H4z M4 10h16 M8 15h3",
  inventory: "m4 7 8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10 M8 5l8 4",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  loyalty: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8",
  reports: "M4 3v18h17 M8 16v-4 M13 16V7 M18 16v-7",
  automation: "M4 5h9a4 4 0 0 1 4 4v1 M14 7l3 3 3-3 M20 19h-9a4 4 0 0 1-4-4v-1 M4 17l3-3 3 3",
  intelligence: "M8 4h8v3h3v10h-3v3H8v-3H5V7h3z M9 10h6v4H9z M2 9h3 M19 9h3 M2 15h3 M19 15h3",
  plus: "M12 5v14 M5 12h14",
  table: "M3 7h18v4H3z M6 11v9 M18 11v9 M6 17h12",
  order: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
  kitchen: "M5 13a4 4 0 0 1 0-8 7 7 0 0 1 14 0 4 4 0 0 1 0 8v7H5z M5 16h14",
  sliders: "M4 6h6 M14 6h6 M4 12h10 M18 12h2 M4 18h2 M10 18h10 M10 3v6 M14 9v6 M6 15v6",
  scan: "M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M7 8v8 M11 8v8 M15 8v8 M18 8v8",
  tag: "M3 3h8l10 10-8 8L3 11z M7 7h.01",
  store: "M3 9l2-6h14l2 6 M3 9h18v3H3z M5 12v9h14v-9 M9 21v-6h6v6",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18",
  box: "M3 8l9-5 9 5v12H3z M3 8h18 M12 8v6 M8 17h3",
  check: "m5 12 4 4L19 6",
  sync: "M20 7a8 8 0 0 0-14-2L3 8 M3 3v5h5 M4 17a8 8 0 0 0 14 2l3-3 M16 16h5v5",
  arrow: "M4 12h16 M14 6l6 6-6 6",
};
export function OnboardingIcon({ name }: { name: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.plus}/></svg>;
}
export function CometaWordmark() {
  return <span className="cometa-wordmark" aria-label="COMETA POS"><span className="cometa-wordmark-crop"><img src="/brand/cometa-logo.png" alt="" width="170" height="170"/></span><span className="cometa-wordmark-pos">POS</span></span>;
}

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [index, setIndex] = useState(0);
  const layout = usePosLayout();
  const slide = onboardingSlides[index];
  const heading = useRef<HTMLHeadingElement>(null);
  const final = index === onboardingSlides.length - 1;
  const gesture = useRef<{ id: number; x: number; y: number; width: number; height: number } | null>(null);
  const swiped = useRef(false);
  function go(next: number) {
    setIndex(Math.max(0, Math.min(onboardingSlides.length - 1, next)));
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }
  function startSwipe(event: PointerEvent<HTMLElement>) {
    swiped.current = false;
    if (!event.isPrimary) { gesture.current = null; return; }
    if (event.pointerType === "mouse" || (event.target as Element).closest("button, a, input")) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: innerWidth, height: innerHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveSwipe(event: PointerEvent<HTMLElement>) {
    const start = gesture.current;
    if (start?.id === event.pointerId && Math.abs(event.clientY - start.y) > 12 && Math.abs(event.clientY - start.y) > Math.abs(event.clientX - start.x)) gesture.current = null;
  }
  function endSwipe(event: PointerEvent<HTMLElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId || start.width !== innerWidth || start.height !== innerHeight) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped.current = true;
    go(index + (dx < 0 ? 1 : -1));
  }
  return <main className="pos-onboarding" data-layout={layout} data-slide={slide.id} aria-label="Conoce COMETA POS"
    onPointerDown={startSwipe} onPointerMove={moveSwipe} onPointerUp={endSwipe}
    onPointerCancel={() => { gesture.current = null; }}
    onClickCapture={event => { if (swiped.current) { event.preventDefault(); event.stopPropagation(); swiped.current = false; } }}>
    <div className="ob-photo" key={slide.image}>
      <img src={`/onboarding/${slide.image}`} alt={slide.alt} fetchPriority="high" decoding="async"/>
      <div className="ob-photo-shade"/>
      {slide.stories.length > 0 && <div className="ob-stories" aria-hidden="true">
        {slide.stories.map((story, n) => <div className={`ob-story ob-story-${n + 1}`} key={story.title}>
          <span className="ob-story-icon"><OnboardingIcon name={story.icon}/></span>
          <span><strong>{story.title}</strong><small>{story.detail}</small></span>
          <span className="ob-story-dot"/>
        </div>)}
        <span className="ob-demo-label">VISTA ILUSTRATIVA</span>
      </div>}
      <p className="ob-photo-caption">{slide.caption}</p>
    </div>
    <header className="ob-header"><CometaWordmark/><button className="ob-skip" onClick={onComplete}>Saltar <OnboardingIcon name="arrow"/></button></header>
    <section className="ob-content" aria-labelledby="ob-headline">
      <div className="ob-narrative" key={slide.id}>
        <p className="ob-eyebrow"><span/>{slide.category}</p>
        <h1 id="ob-headline" ref={heading} tabIndex={-1}>{slide.headline[0]}<br/><span>{slide.headline[1]}</span></h1>
        <p className="ob-copy">{slide.copy}</p>
        <ul className="ob-features">{slide.features.map((feature, n) => <li key={feature} data-priority={n < 4 ? "primary" : "extended"}><OnboardingIcon name={slide.icons[n]}/><span>{feature}</span></li>)}</ul>
        {final && <p className="ob-optional">COMU es opcional. Tu POS funciona por sí solo.</p>}
      </div>
      <footer className="ob-footer">
        <nav className="ob-progress" aria-label="Progreso del onboarding">
          <span className="ob-count" aria-live="polite"><b>{String(index + 1).padStart(2, "0")}</b><span>/</span>04</span>
          <div className="ob-tracks">{onboardingSlides.map((item, n) => <button key={item.id} aria-label={`Ir a slide ${n + 1}`} aria-current={index === n ? "step" : undefined} data-complete={n <= index} onClick={() => go(n)}><span/></button>)}</div>
        </nav>
        <button className="ob-continue" onClick={() => final ? onComplete() : go(index + 1)}><span>{final ? "Comenzar con COMETA POS" : "Continuar"}</span><OnboardingIcon name="arrow"/></button>
        <button className="ob-account" onClick={onComplete}>Ya tengo una cuenta</button>
      </footer>
    </section>
  </main>;
}
