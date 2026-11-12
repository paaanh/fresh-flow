/**
 * Quantities customers can buy.
 * Goods sold by weight / volume (kg, g, lạng, lít…) can be bought in decimals (1,5 kg);
 * goods sold by the piece (hộp, nải, bó, quả…) stay whole numbers.
 */
const DECIMAL_UNITS = new Set(['kg', 'kí', 'ký', 'g', 'gr', 'gram', 'gam', 'lạng', 'lang', 'l', 'lít', 'lit', 'ml', 'yến', 'tạ', 'cân']);

export function isDecimalUnit(unit?: string | null): boolean {
  return DECIMAL_UNITS.has(String(unit || '').trim().toLowerCase());
}

/** Step of the − / + buttons. */
export const qtyStep = (unit?: string | null) => (isDecimalUnit(unit) ? 0.5 : 1);
/** Smallest quantity that can be ordered. */
export const minQty = (unit?: string | null) => (isDecimalUnit(unit) ? 0.1 : 1);

/** Keep at most 3 decimals (what the server stores) and avoid 0.1 + 0.2 artefacts. */
export const roundQty = (q: number) => Math.round(q * 1000) / 1000;

/** Clean a typed / stepped quantity for this unit: decimals only where allowed, within [min, max]. */
export function normalizeQty(q: number, unit?: string | null, max?: number): number {
  if (!Number.isFinite(q)) return minQty(unit);
  let v = isDecimalUnit(unit) ? roundQty(q) : Math.round(q);
  if (max != null && Number.isFinite(max) && max > 0) v = Math.min(v, isDecimalUnit(unit) ? roundQty(max) : Math.floor(max));
  return Math.max(minQty(unit), v);
}

/** "1,5" / "1.5" → 1.5 */
export const parseQty = (text: string) => Number(String(text).trim().replace(',', '.'));

/** 1.5 → "1,5"; 2 → "2" */
export const formatQty = (q: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(q);
