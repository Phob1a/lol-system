'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { GroupKnockoutConfig } from '@/lib/tournament/types';

// ── constants ──────────────────────────────────────────────────────────────

const ROUND_KEYS_FOR_ADVANCING: Record<number, string[]> = {
  2: ['FINAL'],
  4: ['SF', 'FINAL'],
  8: ['QF', 'SF', 'FINAL'],
  16: ['R16', 'QF', 'SF', 'FINAL'],
};

export const KIND_OPTIONS = [
  { value: '正赛', label: '正赛' },
  { value: '娱乐赛', label: '娱乐赛' },
  { value: '海斗', label: '海斗' },
  { value: '__custom__', label: '自定义' },
];

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

// ── exported types ─────────────────────────────────────────────────────────

export type TournamentConfigValue = {
  /** 赛事名（已 trim，父组件直接用） */
  name: string;
  /** 类别（已解析——自定义已展开为文本），父组件直接用作 kind */
  kind: string;
  config: GroupKnockoutConfig;
};

type Props = {
  value: TournamentConfigValue;
  onChange: (v: TournamentConfigValue) => void;
  /** 校验状态回调（useEffect 依赖变化时触发） */
  onValidityChange?: (valid: boolean) => void;
  /** 是否渲染赛事名 Input；默认 false */
  showNameField?: boolean;
  /** 是否渲染结构参数（组数/每组队数/出线/BO）；默认 true */
  showStructure?: boolean;
  /** 用户主动修改赛事名时的回调（仅 showNameField=true 时有意义） */
  onNameUserEdit?: () => void;
  /**
   * DOM id 前缀，用于区分同页多个实例（避免重复 id / 错乱的 label 关联）。
   * 默认空 = 沿用裸 id（如 `t-groups`）。
   */
  idPrefix?: string;
};

// ── helpers ────────────────────────────────────────────────────────────────

/** 从外部 kind 字符串反解 kindSelect / kindCustom */
function parseKind(kind: string): { kindSelect: string; kindCustom: string } {
  const match = KIND_OPTIONS.find((o) => o.value !== '__custom__' && o.value === kind);
  if (match) return { kindSelect: kind, kindCustom: '' };
  return { kindSelect: '__custom__', kindCustom: kind };
}

// ── component ──────────────────────────────────────────────────────────────

export function TournamentConfigForm({
  value,
  onChange,
  onValidityChange,
  showNameField = false,
  showStructure = true,
  onNameUserEdit,
  idPrefix,
}: Props) {
  // Scope DOM ids to this instance so multiple forms can coexist on one page.
  const fid = (s: string) => (idPrefix ? `${idPrefix}-${s}` : s);
  // Derive local ui state from value prop on first render; subsequent changes
  // are driven by internal state and synced back via onChange.
  const parsedKind = parseKind(value.kind);
  const [kindSelect, setKindSelect] = useState<string>(parsedKind.kindSelect);
  const [kindCustom, setKindCustom] = useState<string>(parsedKind.kindCustom);
  const [groupCount, setGroupCount] = useState<number>(value.config.groupCount);
  const [teamsPerGroup, setTeamsPerGroup] = useState<number>(value.config.teamsPerGroup);
  const [advancingPerGroup, setAdvancingPerGroup] = useState<number>(
    value.config.advancingPerGroup,
  );
  const [groupBestOf, setGroupBestOf] = useState<1 | 3 | 5>(value.config.groupBestOf);
  const [knockoutBestOf, setKnockoutBestOf] = useState<Record<string, 1 | 3 | 5>>(
    value.config.knockoutBestOf,
  );

  // ── derived ────────────────────────────────────────────────────────────

  const resolvedKind = kindSelect === '__custom__' ? kindCustom.trim() : kindSelect;

  const totalAdvancing = groupCount * advancingPerGroup;
  const roundKeys = useMemo(
    () => ROUND_KEYS_FOR_ADVANCING[totalAdvancing] ?? [],
    [totalAdvancing],
  );

  const koBoMap = useMemo(() => {
    const map: Record<string, 1 | 3 | 5> = {};
    for (const rk of roundKeys) {
      map[rk] = knockoutBestOf[rk] ?? 1;
    }
    return map;
  }, [roundKeys, knockoutBestOf]);

  const advancingOk =
    [2, 4, 8, 16].includes(totalAdvancing) && isPowerOfTwo(totalAdvancing);

  const isValid =
    resolvedKind.length > 0 &&
    advancingOk &&
    roundKeys.length > 0 &&
    (showNameField ? value.name.trim().length > 0 : true);

  // ── sync back to parent ────────────────────────────────────────────────

  useEffect(() => {
    onChange({
      name: value.name,
      kind: resolvedKind,
      config: {
        template: 'group-knockout',
        groupCount,
        teamsPerGroup,
        advancingPerGroup,
        groupBestOf,
        knockoutBestOf: koBoMap,
      },
    });
    // We intentionally do NOT include `value.name` here — name changes come
    // from the parent (season follow-through) and should not re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedKind, groupCount, teamsPerGroup, advancingPerGroup, groupBestOf, koBoMap]);

  // ── report validity ────────────────────────────────────────────────────

  useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  // ── helpers ────────────────────────────────────────────────────────────

  function setKoBO(rk: string, bo: 1 | 3 | 5) {
    setKnockoutBestOf((prev) => ({ ...prev, [rk]: bo }));
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newName = e.target.value;
    onNameUserEdit?.();
    onChange({ ...value, name: newName });
  }

  // ── render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* 赛事名 */}
      {showNameField && (
        <div className="space-y-1">
          <Label htmlFor={fid('t-name')}>赛事名</Label>
          <Input
            id={fid('t-name')}
            value={value.name}
            onChange={handleNameChange}
            placeholder="例：2025 夏季正赛"
          />
        </div>
      )}

      {/* 类型 */}
      <div className="space-y-1">
        <Label>类型</Label>
        <Select value={kindSelect} onValueChange={setKindSelect}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {kindSelect === '__custom__' && (
          <Input
            className="mt-1"
            value={kindCustom}
            onChange={(e) => setKindCustom(e.target.value)}
            placeholder="输入自定义类型名称"
          />
        )}
      </div>

      {/* 结构参数 */}
      {showStructure && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor={fid('t-groups')}>组数</Label>
              <Input
                id={fid('t-groups')}
                type="number"
                min={1}
                value={groupCount}
                onChange={(e) => setGroupCount(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={fid('t-tpg')}>每组队数</Label>
              <Input
                id={fid('t-tpg')}
                type="number"
                min={1}
                value={teamsPerGroup}
                onChange={(e) => setTeamsPerGroup(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={fid('t-apg')}>每组出线数</Label>
              <Input
                id={fid('t-apg')}
                type="number"
                min={1}
                value={advancingPerGroup}
                onChange={(e) => setAdvancingPerGroup(Number(e.target.value))}
              />
            </div>
          </div>

          {/* 小组 BO */}
          <div className="space-y-1">
            <Label>小组赛 BO</Label>
            <Select
              value={String(groupBestOf)}
              onValueChange={(v) => setGroupBestOf(Number(v) as 1 | 3 | 5)}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">BO1</SelectItem>
                <SelectItem value="3">BO3</SelectItem>
                <SelectItem value="5">BO5</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 淘汰赛各轮 BO */}
          {roundKeys.length > 0 ? (
            <div className="space-y-2">
              <Label>淘汰赛各轮 BO</Label>
              {roundKeys.map((rk) => (
                <div key={rk} className="flex items-center gap-3">
                  <span className="w-16 text-sm text-muted-foreground">{rk}</span>
                  <Select
                    value={String(koBoMap[rk] ?? 1)}
                    onValueChange={(v) => setKoBO(rk, Number(v) as 1 | 3 | 5)}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">BO1</SelectItem>
                      <SelectItem value="3">BO3</SelectItem>
                      <SelectItem value="5">BO5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          ) : (
            totalAdvancing > 0 && (
              <p className="text-xs text-destructive">
                出线总数（{totalAdvancing}）须为 2/4/8/16 之一
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
