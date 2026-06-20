'use client';

import { useThemeStyle, type NexusStyle } from './ThemeStyleProvider';

const OPTIONS: { value: NexusStyle; label: string }[] = [
  { value: 'command', label: 'COMMAND' },
  { value: 'celestial', label: 'CELESTIAL' },
];

/**
 * Segmented control that toggles between the NEXUS 'command' and 'celestial'
 * theme styles. Uses the ThemeStyleContext wired via ThemeStyleProvider.
 */
export function ThemeSwitch() {
  const { style, setStyle } = useThemeStyle();

  return (
    <div
      role="group"
      aria-label="Theme style"
      style={{
        display: 'inline-flex',
        border: '1px solid rgb(var(--line))',
        borderRadius: 3,
        overflow: 'hidden',
        fontFamily: 'var(--font-display)',
        fontSize: 11,
        letterSpacing: '0.08em',
      }}
    >
      {OPTIONS.map(({ value, label }) => {
        const active = style === value;
        return (
          <button
            key={value}
            onClick={() => setStyle(value)}
            aria-pressed={active}
            style={{
              padding: '4px 12px',
              background: active ? 'rgb(var(--accent-n) / 0.15)' : 'transparent',
              color: active ? 'rgb(var(--accent-n))' : 'rgb(var(--dim))',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              letterSpacing: 'inherit',
              fontWeight: active ? 700 : 400,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
