'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/admin', label: '概览' },
  { href: '/admin/tournament', label: '赛事管理' },
  { href: '/admin/registrations', label: '报名管理' },
  { href: '/admin/teams', label: '队伍账号' },
  { href: '/admin/draft', label: '选秀控制台' },
  { href: '/admin/audit', label: '审计日志' },
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
            'rounded-md px-3 py-2 text-sm transition-colors',
            active
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {item.label}
        </Link>
      );
    });
  }

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
        <div className="text-sm font-semibold text-foreground">LoL 选人系统</div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="打开导航"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="left-0 top-0 h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none border-y-0 border-l-0 p-0 sm:rounded-none">
          <div className="border-b px-4 py-4">
            <DialogTitle className="text-base">管理导航</DialogTitle>
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
        className="hidden w-52 shrink-0 flex-col gap-1 border-r bg-muted/30 p-3 lg:flex"
      >
        <div className="px-2 pb-3 text-sm font-semibold text-foreground">LoL 选人系统</div>
        {navLinks()}
      </nav>
    </>
  );
}
