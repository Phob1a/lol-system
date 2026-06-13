import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicHomePage } from './PublicHomePage';
import type { PublicHomeContext } from '@/lib/home/public-home';

const registrationContext: PublicHomeContext = {
  season: { name: '夏季赛', status: 'REGISTRATION' },
  tournament: { status: 'SETUP' },
};

describe('PublicHomePage', () => {
  it('renders public entry links instead of a login-only page', () => {
    render(<PublicHomePage context={registrationContext} />);

    expect(screen.getByRole('link', { name: /赛事报名/ })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: /赛事赛程/ })).toHaveAttribute('href', '/tournament');
    expect(screen.getByRole('link', { name: /选秀直播/ })).toHaveAttribute('href', '/live');
    expect(screen.getByRole('link', { name: /登录后台/ })).toHaveAttribute('href', '/login');
  });

  it('shows the current season status', () => {
    render(<PublicHomePage context={registrationContext} />);
    expect(screen.getByRole('heading', { name: '夏季赛报名开放中' })).toBeInTheDocument();
  });

  it('keeps only login as the action when no active season exists', () => {
    render(<PublicHomePage context={{ season: null, tournament: null }} />);
    expect(screen.getByRole('heading', { name: '暂无开放赛季' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /登录后台/ })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: /赛事报名/ })).not.toBeInTheDocument();
  });
});
