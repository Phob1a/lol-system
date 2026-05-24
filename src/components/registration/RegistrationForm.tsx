'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  PublicRegistrationInput,
  POSITIONS,
} from '@/lib/registration/registration-schema';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LoadingButtonContent } from '@/components/ui/loading-button-content';

// Use the input type (with optional fields from .default()) as the form generic,
// so react-hook-form and zodResolver agree on the same type shape.
type FormValues = z.input<typeof PublicRegistrationInput>;

const POSITION_LABELS: Record<string, string> = {
  TOP: '上单',
  JUNGLE: '打野',
  MID: '中单',
  ADC: '射手',
  SUPPORT: '辅助',
};

type PositionCheckboxGroupProps = {
  label: string;
  fieldName: 'primaryPositions' | 'secondaryPositions';
  idPrefix: string;
  form: ReturnType<typeof useForm<FormValues>>;
};

function PositionCheckboxGroup({ label, fieldName, idPrefix, form }: PositionCheckboxGroupProps) {
  return (
    <FormField
      control={form.control}
      name={fieldName}
      render={() => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <div className="flex flex-wrap gap-3 pt-1">
            {POSITIONS.map((pos) => (
              <div key={pos} className="flex items-center gap-1.5">
                <Checkbox
                  id={`${idPrefix}-${pos}`}
                  checked={(form.watch(fieldName) ?? []).includes(pos)}
                  onCheckedChange={(checked) => {
                    const cur = form.getValues(fieldName) ?? [];
                    const next = checked ? [...cur, pos] : cur.filter((p) => p !== pos);
                    form.setValue(fieldName, next, { shouldValidate: true, shouldDirty: true });
                  }}
                />
                <Label htmlFor={`${idPrefix}-${pos}`} className="cursor-pointer text-sm font-normal">
                  {POSITION_LABELS[pos]}
                </Label>
              </div>
            ))}
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

type Props = { seasonName: string };

export function RegistrationForm({ seasonName }: Props) {
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

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="text-4xl">✓</div>
        <h2 className="text-xl font-semibold">报名成功！</h2>
        <p className="text-muted-foreground">您的报名信息已提交，请等待赛事管理员审核。</p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <p className="mb-4 text-sm text-muted-foreground">赛季：{seasonName}</p>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* Game ID */}
        <FormField
          control={form.control}
          name="gameId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>游戏 ID</FormLabel>
              <FormControl>
                <Input placeholder="例：Faker#KR1" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Nickname */}
        <FormField
          control={form.control}
          name="nickname"
          render={({ field }) => (
            <FormItem>
              <FormLabel>昵称</FormLabel>
              <FormControl>
                <Input placeholder="显示用昵称" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Primary Positions */}
        <PositionCheckboxGroup label="主要位置（至少选一个）" fieldName="primaryPositions" idPrefix="primary" form={form} />

        {/* Secondary Positions */}
        <PositionCheckboxGroup label="副位置（可不选）" fieldName="secondaryPositions" idPrefix="secondary" form={form} />

        {/* Current Rank */}
        <FormField
          control={form.control}
          name="currentRank"
          render={({ field }) => (
            <FormItem>
              <FormLabel>当前段位</FormLabel>
              <FormControl>
                <Input placeholder="例：铂金 II" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Peak Rank */}
        <FormField
          control={form.control}
          name="peakRank"
          render={({ field }) => (
            <FormItem>
              <FormLabel>历史最高段位</FormLabel>
              <FormControl>
                <Input placeholder="例：钻石 IV" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Willing to Captain */}
        <FormField
          control={form.control}
          name="willingToCaptain"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Checkbox
                    id="willing-to-captain"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <Label htmlFor="willing-to-captain" className="cursor-pointer text-sm font-normal">
                  愿意担任队长
                </Label>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Statement */}
        <FormField
          control={form.control}
          name="statement"
          render={({ field }) => (
            <FormItem>
              <FormLabel>参赛宣言（最多 200 字，可选）</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  maxLength={200}
                  rows={4}
                  placeholder="介绍自己或表达参赛心情..."
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-none"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={submitting} className="w-full">
          <LoadingButtonContent loading={submitting} loadingText="提交中…">
            提交报名
          </LoadingButtonContent>
        </Button>
      </form>
    </Form>
  );
}
