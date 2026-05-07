'use client';

import { useEffect, useState } from 'react';
import type { Player } from '@prisma/client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { PlayerInput, type PlayerInputType } from '@/lib/players/schema';
import { POSITION_OPTIONS } from './positions';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
} & (
  | { mode: 'create'; player?: undefined }
  | { mode: 'edit'; player: Player }
);

export function PlayerFormDialog({ open, onOpenChange, onSaved, mode, player }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const defaultValues: PlayerInputType =
    mode === 'edit'
      ? {
          gameId: player.gameId,
          nickname: player.nickname,
          primaryPositions: player.primaryPositions,
          secondaryPositions: player.secondaryPositions,
          cost: player.cost,
          isCaptain: player.isCaptain,
          isRetired: player.isRetired,
        }
      : {
          gameId: '',
          nickname: '',
          primaryPositions: [],
          secondaryPositions: [],
          cost: 0,
          isCaptain: false,
          isRetired: false,
        };

  const form = useForm<PlayerInputType>({
    resolver: zodResolver(PlayerInput),
    defaultValues,
  });

  useEffect(() => {
    form.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, player?.id]);

  async function onSubmit(values: PlayerInputType) {
    setSubmitting(true);
    const url = mode === 'create' ? '/api/players' : `/api/players/${player.id}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    setSubmitting(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? '保存失败');
      return;
    }
    toast.success(mode === 'create' ? `已添加 ${values.gameId}` : `已更新 ${values.gameId}`);
    onSaved();
  }

  const primary = form.watch('primaryPositions');
  const secondary = form.watch('secondaryPositions');

  function togglePos(field: 'primaryPositions' | 'secondaryPositions', pos: PlayerInputType['primaryPositions'][number]) {
    const cur = form.getValues(field) ?? [];
    const next = cur.includes(pos) ? cur.filter((p) => p !== pos) : [...cur, pos];
    form.setValue(field, next, { shouldValidate: true, shouldDirty: true });
  }

  if (!open) return null;

  return (
    <div
      onClick={() => onOpenChange(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(7,8,12,0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="tc-card"
        style={{ width: 560, maxWidth: '100%', padding: 24, background: 'var(--tc-bg-1)' }}
      >
        <span className="corner tl" /><span className="corner tr" />
        <span className="corner bl" /><span className="corner br" />

        <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 4, height: 24, background: 'var(--tc-cyan)', boxShadow: '0 0 12px var(--tc-cyan)' }} />
          <div>
            <div className="tc-h2" style={{ fontSize: 16 }}>
              {mode === 'create' ? 'NEW PLAYER' : `EDIT // ${player.gameId}`}
            </div>
            <div className="tc-mono" style={{ fontSize: 10, color: 'var(--tc-text-faint)' }}>
              gameId 为唯一键。新增时自动注册同名登录账号（默认密码，强制首次改密）。
            </div>
          </div>
        </header>

        <form onSubmit={form.handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field
              label="GAME ID *"
              disabled={mode === 'edit'}
              {...form.register('gameId')}
              error={form.formState.errors.gameId?.message}
            />
            <Field label="NICKNAME *" {...form.register('nickname')} error={form.formState.errors.nickname?.message} />
          </div>

          <PosGroup
            label="PRIMARY POSITIONS *"
            selected={primary ?? []}
            onToggle={(p) => togglePos('primaryPositions', p)}
            error={form.formState.errors.primaryPositions?.message as string | undefined}
          />

          <PosGroup
            label="SECONDARY POSITIONS"
            selected={secondary ?? []}
            onToggle={(p) => togglePos('secondaryPositions', p)}
            muted
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field
              label="COST *"
              type="number"
              step="any"
              min="0"
              {...form.register('cost', { valueAsNumber: true })}
              error={form.formState.errors.cost?.message}
            />
            <Toggle
              label="CAPTAIN"
              checked={form.watch('isCaptain')}
              onChange={(v) => form.setValue('isCaptain', v)}
              accent="var(--tc-cyan)"
            />
            <Toggle
              label="RETIRED"
              checked={form.watch('isRetired')}
              onChange={(v) => form.setValue('isRetired', v)}
              accent="var(--tc-red)"
            />
          </div>

          <div className="tc-divider" />

          <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="tc-btn" onClick={() => onOpenChange(false)}>
              CANCEL
            </button>
            <button type="submit" className="tc-btn tc-btn-primary" disabled={submitting}>
              {submitting ? '▸ SAVING…' : '▸ SAVE'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

const Field = ({ label, error, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span className="tc-label">{label}</span>
    <input
      {...rest}
      className="tc-mono"
      style={{
        background: 'var(--tc-bg-0)',
        color: 'var(--tc-text)',
        border: '1px solid var(--tc-line2)',
        padding: '7px 10px',
        fontSize: 12,
        letterSpacing: 1,
        outline: 'none',
        opacity: rest.disabled ? 0.5 : 1,
      }}
    />
    {error && <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-red)' }}>⚠ {error}</span>}
  </label>
);

const Toggle = ({
  label,
  checked,
  onChange,
  accent,
}: {
  label: string;
  checked?: boolean;
  onChange: (v: boolean) => void;
  accent: string;
}) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span className="tc-label">{label}</span>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        padding: '7px 10px',
        fontFamily: 'var(--tc-font-mono)',
        fontSize: 11,
        letterSpacing: 1.5,
        cursor: 'pointer',
        background: checked ? `${accent}22` : 'var(--tc-bg-0)',
        color: checked ? accent : 'var(--tc-text-dim)',
        border: `1px solid ${checked ? accent : 'var(--tc-line2)'}`,
        boxShadow: checked ? `0 0 10px ${accent}55` : 'none',
        textAlign: 'left',
      }}
    >
      {checked ? '◆ ON' : '○ OFF'}
    </button>
  </label>
);

function PosGroup({
  label,
  selected,
  onToggle,
  error,
  muted,
}: {
  label: string;
  selected: string[];
  onToggle: (p: PlayerInputType['primaryPositions'][number]) => void;
  error?: string;
  muted?: boolean;
}) {
  return (
    <div>
      <span className="tc-label">{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {POSITION_OPTIONS.map((p) => {
          const on = selected.includes(p.value);
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onToggle(p.value)}
              className={`tc-chip ${on ? 'tc-chip-on' : ''}`}
              style={{
                cursor: 'pointer',
                fontSize: 11,
                padding: '4px 12px',
                opacity: muted && !on ? 0.7 : 1,
                border: on ? 'none' : '1px solid var(--tc-line2)',
              }}
            >
              {on ? '◆ ' : '○ '}
              {p.value}
              <span style={{ marginLeft: 4, opacity: 0.55 }}>{p.label}</span>
            </button>
          );
        })}
      </div>
      {error && <span className="tc-mono" style={{ fontSize: 9, color: 'var(--tc-red)' }}>⚠ {error}</span>}
    </div>
  );
}
