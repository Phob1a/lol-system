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
    <nav className="flex items-center gap-1">
      {links.map((l) => {
        const active =
          l.href === '/captain' ? pathname === '/captain' : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
