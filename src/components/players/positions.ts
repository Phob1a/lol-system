import type { Position } from '@prisma/client';
import { POSITIONS } from '@/lib/players/schema';

export const POSITION_LABEL: Record<Position, string> = {
  TOP: '上单',
  JUNGLE: '打野',
  MID: '中单',
  ADC: '射手',
  SUPPORT: '辅助',
};

export const POSITION_OPTIONS = POSITIONS.map((value) => ({
  value,
  label: POSITION_LABEL[value],
}));
