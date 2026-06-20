import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicHomePage } from './PublicHomePage';
import type { PublicHomeContext } from '@/lib/home/public-home';

const registrationContext: PublicHomeContext = {
  tournament: { name: '夏季赛', status: 'REGISTRATION' },
  bracket: { status: 'SETUP' },
};

describe('PublicHomePage', () => {
  it('renders public entry links instead of a login-only page', () => {
    render(<PublicHomePage context={registrationContext} />);

    expect(screen.getByText('LOL-SYSTEM / PUBLIC GATEWAY')).toBeInTheDocument();
    expect(screen.getByText('/ PUBLIC PORTAL')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '进入赛事主控台' })).toBeInTheDocument();
    expect(screen.getByText('CURRENT SIGNAL')).toBeInTheDocument();
    expect(screen.getByText('REG')).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getAllByText('DATA').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: '报名入口' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: '赛事中心' })).toHaveAttribute('href', '/tournament');
    expect(
      screen.getAllByRole('link', { name: /赛事报名/ }).some((link) => link.getAttribute('href') === '/register'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: /赛事赛程/ }).some((link) => link.getAttribute('href') === '/tournament'),
    ).toBe(true);
    expect(
      screen.getAllByRole('link', { name: /选秀直播/ }).some((link) => link.getAttribute('href') === '/live'),
    ).toBe(true);
    expect(screen.getByRole('link', { name: /登录后台/ })).toHaveAttribute('href', '/login');
  });

  it('shows the current season status', () => {
    render(<PublicHomePage context={registrationContext} />);
    expect(screen.getByText('夏季赛报名开放中')).toBeInTheDocument();
  });

  it('keeps only login as the action when no active season exists', () => {
    render(<PublicHomePage context={{ tournament: null, bracket: null }} />);
    expect(screen.getByText('暂无开放赛事')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '登录系统' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /登录后台/ })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: /赛事报名/ })).not.toBeInTheDocument();
  });
});
