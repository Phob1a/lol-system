import { render, screen } from '@testing-library/react';
import { RadioTower } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  ArenaCta,
  ArenaEmptyState,
  ArenaPanel,
  ArenaStatCard,
  PublicArenaHud,
  PublicArenaShell,
} from './index';

describe('public arena primitives', () => {
  it('renders a shared shell and HUD without hiding content', () => {
    render(
      <PublicArenaShell
        hud={
          <PublicArenaHud
            eyebrow="LOL-SYSTEM / PUBLIC GATEWAY"
            title="公开入口"
            signals={[{ label: 'DATA READY' }]}
            actions={<ArenaCta href="/tournament">进入赛事</ArenaCta>}
          />
        }
      >
        <ArenaPanel eyebrow="SIGNAL" title="面板标题">
          <p>核心内容</p>
        </ArenaPanel>
      </PublicArenaShell>,
    );

    expect(screen.getByText('LOL-SYSTEM / PUBLIC GATEWAY')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '进入赛事' })).toHaveAttribute('href', '/tournament');
    expect(screen.getByRole('heading', { name: '面板标题' })).toBeInTheDocument();
    expect(screen.getByText('核心内容')).toBeInTheDocument();
  });

  it('renders stat cards and empty states with stable semantic copy', () => {
    render(
      <PublicArenaShell>
        <ArenaStatCard icon={RadioTower} label="LIVE SIGNAL" value="ON" detail="选秀同步中" />
        <ArenaEmptyState
          eyebrow="LIVE SIGNAL OFFLINE"
          title="选秀尚未开始"
          description="有可公开赛季后会自动显示直播控制台。"
          action={<ArenaCta href="/">返回首页</ArenaCta>}
        />
      </PublicArenaShell>,
    );

    expect(screen.getByText('LIVE SIGNAL')).toBeInTheDocument();
    expect(screen.getByText('ON')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '选秀尚未开始' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
  });
});
