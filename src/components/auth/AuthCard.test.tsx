import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthCard } from './AuthCard';

describe('AuthCard', () => {
  it('renders auth pages inside the arena access shell', () => {
    render(
      <AuthCard title="控制台登录" description="进入管理员或队长工作台。">
        <button type="button">登录</button>
      </AuthCard>,
    );

    expect(screen.getByText('SECURE ACCESS')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '控制台登录' })).toBeInTheDocument();
    expect(screen.getByText('进入管理员或队长工作台。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
  });
});
