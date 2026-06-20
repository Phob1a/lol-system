import type { ReactNode } from 'react';
import { ArenaPanel, PublicArenaShell } from '@/components/public-arena';

export function AuthCard({
  title,
  description,
  children,
  centered = true,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  centered?: boolean;
}) {
  const card = (
    <ArenaPanel
      eyebrow="SECURE ACCESS"
      title={title}
      className="arena-form mx-auto w-full max-w-sm p-5 md:p-6"
    >
      {description ? (
        <p className="mb-5 text-sm leading-6 text-slate-300">{description}</p>
      ) : null}
      {children}
    </ArenaPanel>
  );

  if (!centered) return card;

  return (
    <PublicArenaShell
      className="min-h-screen"
      contentClassName="min-h-screen justify-center py-10"
    >
      {card}
    </PublicArenaShell>
  );
}
