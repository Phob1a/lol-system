import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default async function TournamentLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#07111f]">
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
