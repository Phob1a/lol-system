'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ClipboardList, Gauge, Menu, ShieldCheck, Trophy, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: '概览', icon: Gauge },
  { href: '/admin/tournament', label: '赛事管理', icon: Trophy },
  { href: '/admin/registrations', label: '报名管理', icon: ClipboardList },
  { href: '/admin/teams', label: '队伍账号', icon: Users },
  { href: '/admin/draft', label: '选秀控制台', icon: Activity },
  { href: '/admin/audit', label: '审计日志', icon: ShieldCheck },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function navLinks(onNavigate?: () => void) {
    return NAV.map((item) => {
      const Icon = item.icon;
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
            'group flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition',
            active
              ? 'border-cyan-200/35 bg-cyan-200/[0.14] text-cyan-50 shadow-[0_0_22px_rgba(94,231,255,0.15)]'
              : 'border-transparent text-slate-300 hover:border-cyan-200/20 hover:bg-cyan-200/[0.08] hover:text-cyan-50',
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4 shrink-0',
              active ? 'text-cyan-100' : 'text-cyan-200/55 group-hover:text-cyan-100',
            )}
          />
          {item.label}
        </Link>
      );
    });
  }

  return (
    <>
      <div className="relative z-20 flex h-14 items-center justify-between border-b border-cyan-200/15 bg-slate-950/80 px-4 text-white backdrop-blur-xl lg:hidden">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
            ADMIN
          </div>
          <div className="text-sm font-semibold text-white">LoL 选人系统</div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="打开导航"
          className="border border-cyan-200/20 bg-cyan-200/10 text-cyan-50 hover:bg-cyan-200/[0.18]"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="workspace-console left-0 top-0 h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none border-y-0 border-l-0 border-r border-cyan-200/20 bg-slate-950/95 p-0 text-white sm:rounded-none">
          <div className="border-b border-cyan-200/15 px-4 py-4">
            <DialogTitle className="text-base text-white">管理导航</DialogTitle>
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
        className="relative z-10 hidden w-60 shrink-0 flex-col gap-1 border-r border-cyan-200/15 bg-slate-950/55 p-3 backdrop-blur-xl lg:flex"
      >
        <div className="px-2 pb-4 pt-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/70">
            Operations
          </div>
          <div className="mt-1 text-base font-black text-white">LoL 选人系统</div>
          <div className="mt-1 text-xs text-slate-400">赛事控制台</div>
        </div>
        {navLinks()}
      </nav>
    </>
  );
}
