// Canonical playing-position constants shared by the draft engine, filters,
// and UI. The per-season participant schema lives in
// `@/lib/registration/registration-schema`.

export const POSITIONS = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'] as const;
export type PositionLiteral = (typeof POSITIONS)[number];
