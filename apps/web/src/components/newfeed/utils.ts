import { toDate } from '@/lib/dates';
import type { CustomerGroup, Post, PostProductInfo } from '@/types/domain';
import type { PricingGroup } from '@/components/post-pricing-manager';

export const POST_TYPES = [
  { value: 'DAILY_SPECIAL', label: '⚡ Món ngon hôm nay', chip: 'bg-amber-100 text-amber-800' },
  { value: 'PROMOTION', label: '🔥 Ưu đãi nhóm', chip: 'bg-rose-100 text-rose-800' },
  { value: 'PRODUCT_INTRO', label: '🌱 Mới lên kệ', chip: 'bg-emerald-100 text-emerald-800' },
] as const;

export const postTypeMeta = (type: string) => POST_TYPES.find(t => t.value === type) || POST_TYPES[2];

export const parseImageUrls = (raw?: string): string[] =>
  (raw || '')
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);

export { toDate };

/** Short absolute time, e.g. "08:00 13/11". */
export const shortDateTime = (iso?: string | null) => {
  const d = toDate(iso);
  return d ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }).format(d) : '';
};

/** "Vừa xong", "5 phút trước", "2 giờ trước", "Hôm qua", "3 ngày trước", then a date. */
export function relativeTime(iso?: string, now = Date.now()) {
  const d = toDate(iso);
  if (!d) return '';
  const t = d.getTime();
  const diff = Math.max(0, now - t) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  return new Intl.DateTimeFormat('vi-VN', { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined }).format(new Date(t));
}

export const fullDate = (iso?: string) => {
  const d = toDate(iso);
  return d ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'full', timeStyle: 'short' }).format(d) : '';
};

/** Old posts may still use the removed "Bếp ăn / Tập thể" audience; treat them as a group-only post. */
export const normalizeAudience = (audience?: string, group?: string | null) =>
  audience === 'COLLECTIVE' ? { audience: 'GROUP', group: group || 'COLLECTIVE' } : { audience: audience || 'ALL', group: group || '' };

export function pricingGroupsOf(customerGroups: CustomerGroup[]): PricingGroup[] {
  return customerGroups
    .filter(g => g.code && g.is_active !== false)
    .map(g => ({ code: g.code, label: g.name || g.code, defaultDiscount: Number(g.discount_percent || 0) }));
}

/** Can the product be bought through this post right now? */
export function buyable(post: Post, info: PostProductInfo) {
  if (post.program_status === 'UPCOMING') return { ok: false, reason: 'Chưa mở bán' };
  if (post.program_status === 'ENDED') return { ok: false, reason: 'Đã kết thúc' };
  if ((info.available_quantity ?? 0) <= 0) return { ok: false, reason: info.remaining_quantity === 0 ? 'Hết suất' : 'Hết hàng' };
  return { ok: true, reason: '' };
}
