'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type Props = { showTeamManagement: boolean };

export function CaptainNav({ showTeamManagement }: Props) {
  const pathname = usePathname();
  const links = [
    { href: '/captain', label: '选秀台' },
    ...(showTeamManagement
      ? [
          { href: '/captain/team', label: '队伍管理' },
          { href: '/captain/reservations', label: '比赛预约' },
        ]
      : []),
  ];
  return (
    <nav className="flex flex-wrap items-center gap-2">
      {links.map((l) => {
        const active =
          l.href === '/captain' ? pathname === '/captain' : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'rounded border px-3 py-2 text-sm font-semibold transition',
              active
                ? 'border-cyan-200/45 bg-cyan-200 text-slate-950 shadow-[0_0_24px_rgba(94,231,255,0.24)]'
                : 'border-white/10 bg-white/5 text-slate-300 hover:border-cyan-200/30 hover:text-white',
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
