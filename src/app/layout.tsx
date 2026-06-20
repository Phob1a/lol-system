import type { Metadata } from 'next';
import {
  Saira,
  Saira_Condensed,
  Newsreader,
  Space_Mono,
  JetBrains_Mono,
  Noto_Sans_SC,
  Noto_Serif_SC,
} from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

// ── NEXUS Phase-0 fonts ──────────────────────────────────────────────────────
const saira = Saira({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-saira',
  display: 'swap',
});

const sairaCondensed = Saira_Condensed({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-saira-condensed',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-sans-sc',
  display: 'swap',
});

const notoSerifSC = Noto_Serif_SC({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-noto-serif-sc',
  display: 'swap',
});
// ────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'LoL 选人系统',
  description: '战队选秀管理系统',
};

/** Inline no-flash script: reads nexus.style from localStorage before paint
 *  and sets data-style on <html>, preventing FOUC on style switch. */
const noFlashScript = `(function(){try{var s=localStorage.getItem('nexus.style');if(s==='command'||s==='celestial'){document.documentElement.setAttribute('data-style',s);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fontClassNames = [
    saira.variable,
    sairaCondensed.variable,
    newsreader.variable,
    spaceMono.variable,
    jetbrainsMono.variable,
    notoSansSC.variable,
    notoSerifSC.variable,
  ].join(' ');

  return (
    <html lang="zh-CN" suppressHydrationWarning className={fontClassNames}>
      <head>
        {/* No-flash: set data-style before paint to avoid FOUC on theme switch */}
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        {/* Wire next/font variables into the NEXUS CSS token slots.
            This overrides the fallback stacks defined in globals.css with
            the self-hosted fonts loaded above. */}
        <style>{`
          :root {
            --font-display: var(--font-saira-condensed), var(--font-noto-sans-sc), sans-serif;
            --font-serif: var(--font-saira-condensed), var(--font-noto-sans-sc), sans-serif;
            --font-body: var(--font-saira), var(--font-noto-sans-sc), system-ui, sans-serif;
            --font-mono: var(--font-jetbrains-mono), monospace;
          }
          :root[data-style="command"] {
            --font-display: var(--font-saira-condensed), var(--font-noto-sans-sc), sans-serif;
            --font-serif: var(--font-saira-condensed), var(--font-noto-sans-sc), sans-serif;
            --font-body: var(--font-saira), var(--font-noto-sans-sc), system-ui, sans-serif;
            --font-mono: var(--font-jetbrains-mono), monospace;
          }
          :root[data-style="celestial"] {
            --font-display: var(--font-saira-condensed), var(--font-noto-sans-sc), sans-serif;
            --font-serif: var(--font-newsreader), var(--font-noto-serif-sc), Georgia, serif;
            --font-body: var(--font-saira), var(--font-noto-sans-sc), system-ui, sans-serif;
            --font-mono: var(--font-space-mono), var(--font-jetbrains-mono), monospace;
          }
        `}</style>
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
