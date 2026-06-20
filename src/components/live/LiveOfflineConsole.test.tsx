import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveOfflineConsole } from './LiveOfflineConsole';

describe('LiveOfflineConsole', () => {
  it('renders a full command view instead of a sparse empty state', () => {
    render(<LiveOfflineConsole />);

    expect(screen.getByText('/LIVE SPECTATOR')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'LIVE COMMAND VIEW' })).toBeInTheDocument();
    expect(screen.getByText('TEAM PULSE')).toBeInTheDocument();
    expect(screen.getByText('EVENT FEED')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
  });
});
