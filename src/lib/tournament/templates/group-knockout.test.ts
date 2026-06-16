import { describe, expect, it } from 'vitest';
import { groupKnockout } from './group-knockout';

const cfg = (over: object = {}) => ({
  template: 'group-knockout',
  groupCount: 2,
  teamsPerGroup: 4,
  advancingPerGroup: 2,
  groupBestOf: 1,
  knockoutBestOf: { SF: 3, FINAL: 5 },
  ...over,
});

describe('validate', () => {
  it('接受 2组×4队×2出线（出线4 = 2^2）', () => {
    expect(() => groupKnockout.validate(cfg())).not.toThrow();
  });
  it('拒绝出线总数非 2 的幂', () => {
    expect(() => groupKnockout.validate(cfg({ groupCount: 3 }))).toThrow(/2 的幂/);
  });
  it('拒绝出线数 ≥ 每组队数', () => {
    expect(() => groupKnockout.validate(cfg({ advancingPerGroup: 4 }))).toThrow();
  });
});

describe('generate 2×4×2（出线4 → SF+FINAL）', () => {
  const sk = groupKnockout.generate(8, groupKnockout.validate(cfg()));

  it('生成 GROUP + KNOCKOUT 两个阶段、2 个组', () => {
    expect(sk.stages).toHaveLength(2);
    expect(sk.stages[0].groups.map((g) => g.name)).toEqual(['A', 'B']);
  });
  it('每组单循环 C(4,2)=6 场，共 12 场小组赛', () => {
    expect(sk.stages[0].matches).toHaveLength(12);
  });
  it('淘汰赛 = 2 场 SF + 1 场 FINAL，SF 胜者边指向 FINAL 两个位', () => {
    const ko = sk.stages[1].matches;
    expect(ko.filter((m) => m.roundKey === 'SF')).toHaveLength(2);
    expect(ko.filter((m) => m.roundKey === 'FINAL')).toHaveLength(1);
    expect(sk.edges).toHaveLength(2);
    expect(new Set(sk.edges.map((e) => e.slot))).toEqual(new Set(['A', 'B']));
  });
  it('种子映射交叉编排：A1–B2、B1–A2', () => {
    expect(sk.seedMap['0-1'].matchKey).toBe(sk.seedMap['1-2'].matchKey); // A1 与 B2 同场
    expect(sk.seedMap['1-1'].matchKey).toBe(sk.seedMap['0-2'].matchKey); // B1 与 A2 同场
    expect(sk.seedMap['0-1'].matchKey).not.toBe(sk.seedMap['1-1'].matchKey);
  });
  it('淘汰赛 bestOf 按轮次取 knockoutBestOf', () => {
    const ko = sk.stages[1].matches;
    expect(ko.find((m) => m.roundKey === 'SF')!.bestOf).toBe(3);
    expect(ko.find((m) => m.roundKey === 'FINAL')!.bestOf).toBe(5);
  });
});

describe('generate 4×4×2（出线8 → QF 起）', () => {
  const c = groupKnockout.validate(
    cfg({ groupCount: 4, knockoutBestOf: { QF: 3, SF: 3, FINAL: 5 } }),
  );
  const sk = groupKnockout.generate(16, c);
  it('QF×4 SF×2 FINAL×1，边数 = 6，端点闭合', () => {
    const ko = sk.stages[1].matches;
    expect(ko).toHaveLength(7);
    expect(sk.edges).toHaveLength(6);
    const keys = new Set(ko.map((m) => m.key));
    for (const e of sk.edges) {
      expect(keys.has(e.fromKey)).toBe(true);
      expect(keys.has(e.toKey)).toBe(true);
    }
  });
});
