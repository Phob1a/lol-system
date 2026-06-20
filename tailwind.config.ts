import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        // ── NEXUS design tokens (RGB channel triplets; grouped under `nexus`
        //    to avoid clobbering shadcn's own `accent` / `background` etc.) ─
        nexus: {
          bg: 'rgb(var(--bg) / <alpha-value>)',
          surface: 'rgb(var(--surface) / <alpha-value>)',
          panel: 'rgb(var(--panel) / <alpha-value>)',
          'panel-2': 'rgb(var(--panel-2) / <alpha-value>)',
          line: 'rgb(var(--line) / <alpha-value>)',
          ink: 'rgb(var(--ink) / <alpha-value>)',
          dim: 'rgb(var(--dim) / <alpha-value>)',
          faint: 'rgb(var(--faint) / <alpha-value>)',
          accent: 'rgb(var(--accent-n) / <alpha-value>)',
          'accent-2': 'rgb(var(--accent-n2) / <alpha-value>)',
          good: 'rgb(var(--good) / <alpha-value>)',
          bad: 'rgb(var(--bad) / <alpha-value>)',
          gold: 'rgb(var(--gold) / <alpha-value>)',
          hot: 'rgb(var(--hot) / <alpha-value>)',
        },
      },
      fontFamily: {
        // NEXUS font families — resolved via CSS variables set by next/font
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
        serif: ['var(--font-serif)'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [animate],
};

export default config;
