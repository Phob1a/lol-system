'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import Kicker from '@/components/nexus/Kicker';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  sub: string;
  glyph: string;
};

// Mirrors prototype ADMIN_NAV (admin.jsx l.390): glyph + label + sub-caption.
const NAV: NavItem[] = [
  { href: '/admin', label: '概览', sub: 'CONTROL', glyph: '▦' },
  { href: '/admin/tournament', label: '赛事管理', sub: 'STATE', glyph: '◈' },
  { href: '/admin/registrations', label: '报名管理', sub: 'REVIEW', glyph: '⊕' },
  { href: '/admin/imports', label: '对局导入', sub: 'LCU · REVIEW', glyph: '⤓' },
  { href: '/admin/teams', label: '队伍账号', sub: 'ROSTERS', glyph: '⬡' },
  { href: '/admin/draft', label: '选秀控制台', sub: 'STATE · DRAFT', glyph: '◇' },
  { href: '/admin/audit', label: '审计日志', sub: 'AUDIT', glyph: '▤' },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function navLinks(onNavigate?: () => void) {
    return NAV.map((item) => {
      const active =
        item.href === '/admin'
          ? pathname === '/admin'
          : pathname.startsWith(item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? 'page' : undefined}
          onClick={onNavigate}
          className={cn(
            'group flex items-center gap-3 rounded-[var(--radius-nexus)] px-3 py-2 transition-colors',
            'border',
            active
              ? 'border-nexus-accent/55 bg-nexus-accent/10 text-nexus-accent'
              : 'border-transparent text-nexus-dim hover:border-nexus-line hover:bg-nexus-panel-2 hover:text-nexus-ink',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'grid h-7 w-7 shrink-0 place-items-center border text-[13px]',
              'rounded-[var(--radius-nexus)]',
              active
                ? 'border-nexus-accent/55 text-nexus-accent'
                : 'border-nexus-line text-nexus-faint group-hover:text-nexus-ink',
            )}
          >
            {item.glyph}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm leading-tight">{item.label}</span>
            <span
              aria-hidden
              className="block font-mono text-[9px] uppercase tracking-[0.18em] text-nexus-faint"
            >
              {item.sub}
            </span>
          </span>
        </Link>
      );
    });
  }

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-nexus-line bg-nexus-panel px-4 lg:hidden">
        <div className="font-display text-sm tracking-wide text-nexus-ink">LOL大王杯</div>
        <button
          type="button"
          aria-label="打开导航"
          onClick={() => setMobileOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-[var(--radius-nexus)] border border-nexus-line bg-nexus-panel-2 text-nexus-dim transition-colors hover:border-nexus-accent/65 hover:text-nexus-accent"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="left-0 top-0 h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none border-y-0 border-l-0 border-r border-nexus-line bg-nexus-panel p-0 sm:rounded-none">
          <div className="border-b border-nexus-line px-4 py-4">
            <DialogTitle className="font-display text-base text-nexus-ink">管理导航</DialogTitle>
            <DialogDescription className="sr-only">
              选择管理后台页面，按 Esc 可关闭导航抽屉。
            </DialogDescription>
          </div>
          <nav aria-label="移动端后台导航" className="flex flex-col gap-1 p-3">
            {navLinks(() => setMobileOpen(false))}
          </nav>
        </DialogContent>
      </Dialog>

      <nav
        aria-label="后台主导航"
        className="hidden w-56 shrink-0 flex-col gap-1 border-r border-nexus-line bg-nexus-bg p-3 lg:flex"
      >
        <div className="px-2 pb-3">
          <div className="font-display text-sm tracking-wide text-nexus-ink">LOL大王杯</div>
          <Kicker className="mt-1 block">OPS BACK-OFFICE</Kicker>
        </div>
        {navLinks()}
      </nav>
    </>
  );
}
