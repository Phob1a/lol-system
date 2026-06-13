/**
 * Shared datetime-local <-> ISO string helpers.
 * Used by reservation dialogs to ensure consistent
 * timezone/format handling across the admin UI.
 */

export function toLocalDatetimeString(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalDatetimeString(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}
