import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppSidebar } from './AppSidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/teams',
}));

describe('AppSidebar', () => {
  it('provides an accessible mobile navigation drawer', () => {
    render(<AppSidebar />);

    const trigger = screen.getByRole('button', { name: '打开导航' });
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: '管理导航' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '队伍账号' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryAllByRole('link', { name: '系统配置', hidden: true })).toHaveLength(0);
    expect(screen.getAllByRole('link', { name: '赛事管理', hidden: true })).toHaveLength(2);
  });
});
