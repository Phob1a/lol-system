import type { CSSProperties } from 'react';

const PARTICLES = [
  { x: 7, y: 18, size: 2, delay: -1, dur: 13 },
  { x: 13, y: 62, size: 1, delay: -8, dur: 15 },
  { x: 19, y: 34, size: 3, delay: -4, dur: 16 },
  { x: 24, y: 78, size: 2, delay: -10, dur: 18 },
  { x: 31, y: 12, size: 1, delay: -5, dur: 14 },
  { x: 37, y: 52, size: 2, delay: -12, dur: 20 },
  { x: 43, y: 27, size: 1, delay: -2, dur: 13 },
  { x: 49, y: 84, size: 3, delay: -11, dur: 19 },
  { x: 55, y: 42, size: 2, delay: -6, dur: 17 },
  { x: 61, y: 16, size: 1, delay: -13, dur: 15 },
  { x: 67, y: 71, size: 2, delay: -3, dur: 18 },
  { x: 73, y: 36, size: 1, delay: -9, dur: 16 },
  { x: 79, y: 58, size: 3, delay: -7, dur: 20 },
  { x: 85, y: 22, size: 2, delay: -14, dur: 14 },
  { x: 91, y: 80, size: 1, delay: -5, dur: 17 },
  { x: 96, y: 48, size: 2, delay: -12, dur: 19 },
];

export function ArenaAtmosphere() {
  return (
    <div className="arena-atmosphere" aria-hidden="true">
      <div className="arena-starfield" />
      <div className="arena-light-ribbon arena-light-ribbon-a" />
      <div className="arena-light-ribbon arena-light-ribbon-b" />
      <div className="arena-sweep-beam" />
      <div className="arena-radar-line" />
      <div className="arena-particle-field">
        {PARTICLES.map((particle) => (
          <span
            key={`${particle.x}-${particle.y}`}
            className="arena-particle"
            style={
              {
                '--x': `${particle.x}%`,
                '--y': `${particle.y}%`,
                '--size': `${particle.size}px`,
                '--delay': `${particle.delay}s`,
                '--dur': `${particle.dur}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
