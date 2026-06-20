'use client';

/**
 * RegistrationForm — NEXUS-restyled public registration screen.
 *
 * Layout (prototype screen 5 — SignupScreen):
 *   left  : form Panel  (game ID · nickname · positions · ranks · statement · captain toggle · submit)
 *   right : sticky PlayerCard preview Panel (live update as user types)
 *           + 报名概况 Panel (registration count / captain count)
 *
 * Submit logic is PRESERVED verbatim: Zod + react-hook-form → POST /api/register.
 * Only presentation is changed (nexus primitives, tokens, no hardcoded hex).
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import Link from 'next/link';

import {
  PublicRegistrationInput,
  POSITIONS,
} from '@/lib/registration/registration-schema';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from '@/components/ui/form';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';

import Panel from '@/components/nexus/Panel';
import PanelHead from '@/components/nexus/PanelHead';
import Kicker from '@/components/nexus/Kicker';
import Chip from '@/components/nexus/Chip';
import NexusButton from '@/components/nexus/NexusButton';
import PosPip, { type Position } from '@/components/nexus/PosPip';
import Readout from '@/components/nexus/Readout';
import Field from '@/components/nexus/Field';

// ── Types ─────────────────────────────────────────────────────────────────────

type FormValues = z.input<typeof PublicRegistrationInput>;

// ── Position metadata ─────────────────────────────────────────────────────────

const POS_LABEL: Record<Position, string> = {
  TOP:     '上单',
  JUNGLE:  '打野',
  MID:     '中单',
  ADC:     '射手',
  SUPPORT: '辅助',
};

// ── Inline nexus label ────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[0.16em] block mb-1.5"
      style={{ color: 'rgb(var(--faint))' }}
    >
      {children}
    </span>
  );
}

// ── Field-level inline error ──────────────────────────────────────────────────

function FieldErr({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span
      className="font-mono text-[10px] mt-1 block"
      style={{ color: 'rgb(var(--bad))' }}
    >
      {msg}
    </span>
  );
}

// ── Player card preview ───────────────────────────────────────────────────────

interface PlayerCardProps {
  nickname: string;
  gameId: string;
  currentRank: string;
  primaryPositions: Position[];
  secondaryPositions: Position[];
  captain: boolean;
  success?: boolean;
}

function PlayerCard({
  nickname,
  gameId,
  currentRank,
  primaryPositions,
  secondaryPositions,
  captain,
  success = false,
}: PlayerCardProps) {
  const displayName = nickname.trim() || gameId.trim() || '召唤师';
  const primaryPos: Position = primaryPositions[0] ?? 'MID';
  const rank = currentRank.trim() || '—';

  return (
    <Panel glow={success}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Kicker>{success ? '选手卡 · 已生成' : '选手卡 · 预览'}</Kicker>
          {success && <Chip variant="good">报名成功</Chip>}
        </div>

        {/* Avatar row */}
        <div className="flex items-center gap-3 mb-4">
          <PosPip pos={primaryPos} on size={48} />
          <div className="min-w-0">
            <div
              className="font-display text-[26px] leading-none overflow-hidden text-ellipsis whitespace-nowrap"
              style={{ color: 'rgb(var(--ink))' }}
            >
              {displayName}
            </div>
            <Readout
              className="text-[11px] mt-1"
              style={{ color: 'rgb(var(--faint))' }}
            >
              {rank} · {POS_LABEL[primaryPos]}
            </Readout>
          </div>
        </div>

        {/* Glow divider */}
        <div
          className="w-full h-px my-3"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgb(var(--accent-n) / 0.4), transparent)',
          }}
        />

        {/* Stats rows */}
        <div className="grid gap-2.5">
          <div className="flex justify-between items-center">
            <FieldLabel>召唤师</FieldLabel>
            <Readout className="text-[12px]" style={{ color: 'rgb(var(--ink))' }}>
              {gameId.trim() || '—'}
            </Readout>
          </div>
          <div className="flex justify-between items-center">
            <FieldLabel>主位置</FieldLabel>
            <div className="flex gap-1">
              {primaryPositions.length > 0 ? (
                primaryPositions.map((p) => (
                  <Readout key={p} className="text-[12px] text-nexus-accent">
                    {POS_LABEL[p]}
                  </Readout>
                ))
              ) : (
                <Readout
                  className="text-[12px]"
                  style={{ color: 'rgb(var(--faint))' }}
                >
                  —
                </Readout>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <FieldLabel>副位置</FieldLabel>
            <Readout className="text-[12px]" style={{ color: 'rgb(var(--ink))' }}>
              {secondaryPositions.length
                ? secondaryPositions.map((p) => POS_LABEL[p]).join(' / ')
                : '—'}
            </Readout>
          </div>
          <div className="flex justify-between items-center">
            <FieldLabel>队长意向</FieldLabel>
            <Readout
              className="text-[12px]"
              style={{
                color: captain ? 'rgb(var(--good))' : 'rgb(var(--faint))',
              }}
            >
              {captain ? '是' : '否'}
            </Readout>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ── Main form component ───────────────────────────────────────────────────────

type Props = {
  tournamentName: string;
  registrationCount?: number;
  captainCount?: number;
};

export function RegistrationForm({
  tournamentName,
  registrationCount,
  captainCount,
}: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(PublicRegistrationInput),
    defaultValues: {
      gameId: '',
      nickname: '',
      primaryPositions: [],
      secondaryPositions: [],
      currentRank: '',
      peakRank: '',
      willingToCaptain: false,
      statement: '',
    },
  });

  // ── Preserved submit logic ─────────────────────────────────────────────────
  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (res.status === 201) {
        setSubmitted(true);
        return;
      }
      const body = await res.json().catch(() => ({ error: '请求失败' }));
      // 409 = 重复 gameId / 报名未开放；400 = 校验失败
      toast.error(body.error ?? '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Live preview values ────────────────────────────────────────────────────
  const watchedNickname  = form.watch('nickname') ?? '';
  const watchedGameId    = form.watch('gameId') ?? '';
  const watchedRank      = form.watch('currentRank') ?? '';
  const watchedPrimary   = (form.watch('primaryPositions') ?? []) as Position[];
  const watchedSecondary = (form.watch('secondaryPositions') ?? []) as Position[];
  const watchedCaptain   = form.watch('willingToCaptain') ?? false;
  // statement is watched to ensure re-render on change (preview shows position/rank primarily)
  form.watch('statement');

  // ── Success state ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] p-6">
        <div className="w-full max-w-[440px] grid gap-5 text-center">
          {/* Success heading */}
          <div>
            <div
              className="text-[40px] leading-none mb-3"
              style={{ color: 'rgb(var(--good))' }}
            >
              ✓
            </div>
            <div
              className="font-display text-[28px]"
              style={{ color: 'rgb(var(--ink))' }}
            >
              报名已提交
            </div>
            <Readout
              className="text-[12px] mt-2 block"
              style={{ color: 'rgb(var(--faint))' }}
            >
              已进入选手池 · 等待队长选秀
            </Readout>
          </div>

          {/* Player card */}
          <PlayerCard
            nickname={watchedNickname}
            gameId={watchedGameId}
            currentRank={watchedRank}
            primaryPositions={watchedPrimary}
            secondaryPositions={watchedSecondary}
            captain={watchedCaptain}
            success
          />

          {/* Actions */}
          <div className="flex gap-3">
            <NexusButton variant="primary" className="flex-1 h-11" type="button">
              <Link href="/" className="flex items-center gap-1.5">
                返回首页
              </Link>
            </NexusButton>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  const errors = form.formState.errors;

  return (
    <Form {...form}>
      {/*
        Two-column layout: form on left (fluid), preview on right (380px fixed).
        Collapses to single column on narrow viewports via the responsive class below.
      */}
      <div
        className="grid gap-[18px] p-[22px] mx-auto items-start w-full"
        style={{
          gridTemplateColumns: 'minmax(0,1fr) 380px',
          maxWidth: 1100,
        }}
      >
        {/* ── Left: form panel ─────────────────────────────────────────── */}
        <Panel>
          <PanelHead title="ENLIST · 报名注册" />
          <div className="p-6 space-y-5">
            {/* Tournament name */}
            <div>
              <Kicker className="block mb-1">赛事</Kicker>
              <div
                className="font-serif italic text-[22px]"
                style={{ color: 'rgb(var(--ink))' }}
              >
                {tournamentName}
              </div>
              <Readout
                className="text-[11px] mt-1 block"
                style={{ color: 'rgb(var(--faint))' }}
              >
                填写召唤师信息进入选手池 · 等待队长选秀
              </Readout>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* ── Row: Game ID + Nickname ───────────────────────────── */}
              <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {/* Game ID */}
                <FormField
                  control={form.control}
                  name="gameId"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FieldLabel>召唤师 ID</FieldLabel>
                      <FormControl>
                        <Field
                          placeholder="Player#888"
                          {...field}
                          className={
                            errors.gameId
                              ? 'border-nexus-bad'
                              : field.value && !errors.gameId
                              ? 'border-nexus-good/60'
                              : ''
                          }
                        />
                      </FormControl>
                      <FieldErr msg={errors.gameId?.message} />
                    </FormItem>
                  )}
                />

                {/* Nickname */}
                <FormField
                  control={form.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FieldLabel>游戏昵称</FieldLabel>
                      <FormControl>
                        <Field
                          placeholder="显示用昵称（可留空）"
                          {...field}
                          className={
                            errors.nickname
                              ? 'border-nexus-bad'
                              : field.value && !errors.nickname
                              ? 'border-nexus-good/60'
                              : ''
                          }
                        />
                      </FormControl>
                      <FieldErr msg={errors.nickname?.message} />
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Row: Current Rank + Peak Rank ────────────────────── */}
              <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {/* Current Rank */}
                <FormField
                  control={form.control}
                  name="currentRank"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FieldLabel>当前段位</FieldLabel>
                      <FormControl>
                        <Field
                          placeholder="钻石 IV"
                          {...field}
                          className={
                            errors.currentRank
                              ? 'border-nexus-bad'
                              : field.value && !errors.currentRank
                              ? 'border-nexus-good/60'
                              : ''
                          }
                        />
                      </FormControl>
                      <FieldErr msg={errors.currentRank?.message} />
                    </FormItem>
                  )}
                />

                {/* Peak Rank */}
                <FormField
                  control={form.control}
                  name="peakRank"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FieldLabel>历史最高段位</FieldLabel>
                      <FormControl>
                        <Field
                          placeholder="大师（可选）"
                          {...field}
                          className={
                            errors.peakRank
                              ? 'border-nexus-bad'
                              : field.value && !errors.peakRank
                              ? 'border-nexus-good/60'
                              : ''
                          }
                        />
                      </FormControl>
                      <FieldErr msg={errors.peakRank?.message} />
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Primary positions ──────────────────────────────────── */}
              <FormField
                control={form.control}
                name="primaryPositions"
                render={() => (
                  <FormItem className="space-y-0">
                    <FieldLabel>主位置 · 至少选一个</FieldLabel>
                    <div className="flex gap-2">
                      {(POSITIONS as readonly string[]).map((pos) => {
                        const p = pos as Position;
                        const selected = (
                          form.watch('primaryPositions') ?? []
                        ).includes(p);
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              const cur =
                                form.getValues('primaryPositions') ?? [];
                              const next = selected
                                ? cur.filter((x) => x !== p)
                                : [...cur, p];
                              // Remove from secondary when added to primary
                              const secCur =
                                form.getValues('secondaryPositions') ?? [];
                              form.setValue(
                                'secondaryPositions',
                                secCur.filter((x) => x !== p),
                                { shouldValidate: true },
                              );
                              form.setValue('primaryPositions', next, {
                                shouldValidate: true,
                                shouldDirty: true,
                              });
                            }}
                            className="flex flex-col items-center gap-1.5 flex-1 py-2.5 rounded-[var(--radius-nexus)] border transition-colors cursor-pointer"
                            style={{
                              background: selected
                                ? 'rgb(var(--accent-n) / 0.12)'
                                : 'rgb(var(--panel-2))',
                              borderColor: selected
                                ? 'rgb(var(--accent-n))'
                                : 'rgb(var(--line))',
                            }}
                          >
                            <PosPip pos={p} on={selected} size={26} />
                            <span
                              className="font-mono text-[11px]"
                              style={{
                                color: selected
                                  ? 'rgb(var(--accent-n))'
                                  : 'rgb(var(--faint))',
                              }}
                            >
                              {POS_LABEL[p]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <FieldErr msg={errors.primaryPositions?.message} />
                  </FormItem>
                )}
              />

              {/* ── Secondary positions ────────────────────────────────── */}
              <FormField
                control={form.control}
                name="secondaryPositions"
                render={() => (
                  <FormItem className="space-y-0">
                    <FieldLabel>副位置 · 可多选</FieldLabel>
                    <div className="flex gap-2 flex-wrap">
                      {(POSITIONS as readonly string[])
                        .filter(
                          (p) =>
                            !(form.watch('primaryPositions') ?? []).includes(
                              p as Position,
                            ),
                        )
                        .map((pos) => {
                          const p = pos as Position;
                          const selected = (
                            form.watch('secondaryPositions') ?? []
                          ).includes(p);
                          return (
                            <button
                              key={p}
                              type="button"
                              onClick={() => {
                                const cur =
                                  form.getValues('secondaryPositions') ?? [];
                                const next = selected
                                  ? cur.filter((x) => x !== p)
                                  : [...cur, p];
                                form.setValue('secondaryPositions', next, {
                                  shouldValidate: true,
                                  shouldDirty: true,
                                });
                              }}
                              className="inline-flex items-center gap-[5px] h-7 px-[10px] border rounded-[var(--radius-nexus)] font-mono text-[10px] font-semibold uppercase tracking-[0.08em] cursor-pointer transition-colors"
                              style={{
                                borderColor: selected
                                  ? 'rgb(var(--accent-n) / 0.6)'
                                  : 'rgb(var(--line))',
                                color: selected
                                  ? 'rgb(var(--accent-n))'
                                  : 'rgb(var(--faint))',
                                background: selected
                                  ? 'rgb(var(--accent-n) / 0.08)'
                                  : 'transparent',
                              }}
                            >
                              {POS_LABEL[p]}
                            </button>
                          );
                        })}
                    </div>
                    <FieldErr msg={errors.secondaryPositions?.message} />
                  </FormItem>
                )}
              />

              {/* ── Statement ──────────────────────────────────────────── */}
              <FormField
                control={form.control}
                name="statement"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <div className="flex justify-between items-center mb-1.5">
                      <FieldLabel>参赛宣言（最多 200 字，可选）</FieldLabel>
                      <Readout
                        className="text-[10px]"
                        style={{ color: 'rgb(var(--faint))' }}
                      >
                        {(field.value ?? '').length}/200
                      </Readout>
                    </div>
                    <FormControl>
                      <Field
                        multiline
                        rows={2}
                        placeholder="carry 全场不是梦…"
                        maxLength={200}
                        {...field}
                      />
                    </FormControl>
                    <FieldErr msg={errors.statement?.message} />
                  </FormItem>
                )}
              />

              {/* ── Captain toggle ─────────────────────────────────────── */}
              <FormField
                control={form.control}
                name="willingToCaptain"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <NexusButton
                      type="button"
                      variant={field.value ? 'primary' : 'default'}
                      className="w-full"
                      onClick={() => field.onChange(!field.value)}
                    >
                      {field.value
                        ? '✓ 已申请成为队长'
                        : '申请成为队长（可选）'}
                    </NexusButton>
                  </FormItem>
                )}
              />

              {/* ── Submit + reset ──────────────────────────────────────── */}
              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-11 inline-flex items-center justify-center font-mono font-semibold uppercase tracking-[0.06em] text-[12px] rounded-[var(--radius-nexus)] border border-transparent transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed nexus-btn nexus-btn-primary"
                  style={{
                    background: 'rgb(var(--accent-n))',
                    color: 'rgb(var(--bg))',
                    boxShadow:
                      '0 0 20px rgb(var(--accent-n) / calc(var(--glow) * 0.4))',
                  }}
                >
                  <LoadingButtonContent loading={submitting} loadingText="提交中…">
                    提交报名 · ENLIST
                  </LoadingButtonContent>
                </button>
                <NexusButton
                  type="reset"
                  className="w-[100px] h-11"
                  onClick={() => form.reset()}
                >
                  重置
                </NexusButton>
              </div>

              {/* Global validation hint after first submit attempt */}
              {Object.keys(errors).length > 0 && form.formState.isSubmitted && (
                <p
                  className="font-mono text-[11px]"
                  style={{ color: 'rgb(var(--bad))' }}
                >
                  请完善必填项后提交
                </p>
              )}
            </form>
          </div>
        </Panel>

        {/* ── Right: preview + overview ───────────────────────────────── */}
        <div className="grid gap-4" style={{ position: 'sticky', top: 76 }}>
          {/* Live player card preview */}
          <PlayerCard
            nickname={watchedNickname}
            gameId={watchedGameId}
            currentRank={watchedRank}
            primaryPositions={watchedPrimary}
            secondaryPositions={watchedSecondary}
            captain={watchedCaptain}
          />

          {/* 报名概况 — only shown when server passed counts */}
          {registrationCount !== undefined && (
            <Panel>
              <PanelHead title="报名概况" />
              <div className="p-4 grid gap-3">
                <div className="flex justify-between items-center">
                  <FieldLabel>当前报名</FieldLabel>
                  <Readout className="text-[18px] font-bold text-nexus-accent">
                    {registrationCount}
                  </Readout>
                </div>
                {captainCount !== undefined && (
                  <div className="flex justify-between items-center">
                    <FieldLabel>队长意向</FieldLabel>
                    <Readout
                      className="text-[18px] font-bold"
                      style={{ color: 'rgb(var(--ink))' }}
                    >
                      {captainCount}
                    </Readout>
                  </div>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>

    </Form>
  );
}
