import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BroadcastLayout } from './BroadcastLayout';

describe('BroadcastLayout', () => {
  it('allows callers to choose the default mobile tab', () => {
    render(
      <BroadcastLayout
        defaultMobileTab="grid"
        hero={<div>hero</div>}
        pool={<div>pool panel</div>}
        grid={<div>grid panel</div>}
        events={<div>events panel</div>}
      />,
    );

    expect(screen.getByRole('tab', { name: '队伍' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('grid panel');
  });
});
