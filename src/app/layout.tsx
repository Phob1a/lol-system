import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';
// NEXUS component structural CSS — imported once here so primitive structural
// rules (corner ticks, scanlines, clip-paths, motion) apply app-wide even when
// no nexus component is mounted on a given route.
import '@/components/nexus/nexus.css';

export const metadata: Metadata = {
  title: 'LOL大王杯',
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
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* No-flash: set data-style before paint to avoid FOUC on theme switch */}
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
        {/* Keep the NEXUS font tokens local so production builds do not depend
            on external Google font downloads. */}
        <style>{`
          :root {
            --font-display: "Arial Narrow", "Noto Sans SC", "Microsoft YaHei", sans-serif;
            --font-serif: "Georgia", "Noto Serif SC", "Songti SC", serif;
            --font-body: "Inter", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
            --font-mono: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
          }
          :root[data-style="command"] {
            --font-display: "Arial Narrow", "Noto Sans SC", "Microsoft YaHei", sans-serif;
            --font-serif: "Arial Narrow", "Noto Sans SC", "Microsoft YaHei", sans-serif;
            --font-body: "Inter", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
            --font-mono: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
          }
          :root[data-style="celestial"] {
            --font-display: "Arial Narrow", "Noto Sans SC", "Microsoft YaHei", sans-serif;
            --font-serif: "Georgia", "Noto Serif SC", "Songti SC", serif;
            --font-body: "Inter", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
            --font-mono: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
          }
        `}</style>
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
