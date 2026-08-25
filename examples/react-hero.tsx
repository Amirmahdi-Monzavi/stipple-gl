import { useMemo, useState } from 'react';

import { Particles, useMorphOnScroll } from 'stipple-gl/react';
import { snap } from 'stipple-gl/presets';
import type { Stipple } from 'stipple-gl';

const SHAPES = {
  shield: '/shapes/shield.svg',
  lock: '/shapes/lock.svg',
  check: '/shapes/check.svg',
  none: null,
};

export function ScrollHero() {
  const [instance, setInstance] = useState<Stipple | null>(null);
  const shapes = useMemo(() => SHAPES, []);
  const active = useMorphOnScroll(instance, { shapes });

  return (
    <>
      <Particles {...snap} mode="background" color="#4f9c7d" onInstance={setInstance} />

      <main className="page">
        <section data-stipple-shape="shield">
          <h1>Verify once</h1>
          <p>Currently showing: {active ?? 'nothing'}</p>
        </section>
        <section data-stipple-shape="lock">
          <h2>Encrypted end to end</h2>
        </section>
        <section data-stipple-shape="check">
          <h2>Trusted everywhere</h2>
        </section>
        <section data-stipple-shape="none">
          <h2>Get started</h2>
        </section>
      </main>
    </>
  );
}

export function ConsentCard() {
  const [accepted, setAccepted] = useState(false);

  return (
    <div style={{ position: 'relative', height: 420, borderRadius: 24, overflow: 'hidden' }}>
      <Particles
        mode="container"
        count={1800}
        minorCount={120}
        color={accepted ? '#4f9c7d' : '#63748c'}
        shape={accepted ? '/shapes/check.svg' : '/shapes/shield.svg'}
        morph={1}
      >
        <label style={{ position: 'relative', zIndex: 1 }}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          I agree to the terms
        </label>
      </Particles>
    </div>
  );
}

export function AmbientBackground() {
  return <Particles count={0} minorCount={700} color="#8ab4f8" opacity={0.6} pointer={{ enabled: false }} />;
}
