/**
 * Server times are UTC but come without a timezone (SQLite / MySQL DATETIME, e.g.
 * "2026-11-12T07:30:00"). `new Date()` would read those as local time (7 hours off in
 * Vietnam), so treat a time without a zone as UTC.
 */
export function toDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(iso);
  const d = new Date(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Server time -> value for <input type="datetime-local"> in the user's timezone. */
export function toLocalInput(iso?: string | null): string {
  const d = toDate(iso);
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
