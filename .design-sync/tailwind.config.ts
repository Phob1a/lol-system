// Tailwind config used ONLY by /design-sync to compile the shipped stylesheet.
// Extends the repo's real tailwind.config (same theme tokens / plugins) but
// widens `content` to also scan the authored preview compositions, so every
// utility class the components and previews use is emitted into compiled.css.
import base from '../tailwind.config';
import type { Config } from 'tailwindcss';

const config: Config = {
  ...base,
  content: ['./src/**/*.{ts,tsx}', './.design-sync/previews/**/*.tsx'],
};

export default config;
