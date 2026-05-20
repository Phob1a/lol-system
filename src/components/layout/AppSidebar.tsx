'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: '概览' },
  { href: '/admin/season', label: '赛季管理' },
  { href: '/admin/registrations', label: '报名管理' },
  { href: '/admin/teams', label: '队伍账号' },
  { href: '/admin/draft', label: '选秀控制台' },
  { href: '/admin/audit', label: '审计日志' },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex w-52 shrink-0 flex-col gap-1 border-r bg-muted/30 p-3">
      <div className="px-2 pb-3 text-sm font-semibold text-foreground">LoL 选人系统</div>
      {NAV.map((item) => {
        const active =
          item.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
