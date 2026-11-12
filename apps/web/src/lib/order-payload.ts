import type { OrderCreateIn } from './api';
import { parseCartKey } from './cart';

type CatalogBatch = {
  id: number; is_open: boolean; available_quantity?: number | string;
  initial_quantity?: number | string; approved_quantity?: number | string;
};
export type CatalogProduct = { id: number; batches?: CatalogBatch[]; inventory_batches?: CatalogBatch[] };

/**
 * Turns the cart into order lines with real batch IDs. Lines bought through a Newfeed post carry
 * post_id so the backend charges that post's price and checks its quantity limit. Several lines
 * of the same product (shop + post) may share a batch.
 */
export function allocateOrderItems(catalog: CatalogProduct[], cart: Record<string, number>): OrderCreateIn['items'] {
  const items: OrderCreateIn['items'] = [];
  const left = new Map<number, number>();
  for (const [key, requested] of Object.entries(cart)) {
    const { productId, postId } = parseCartKey(key);
    if (!Number.isFinite(requested) || requested <= 0) throw new Error('Số lượng đặt hàng phải lớn hơn 0.');
    const product = catalog.find(item => Number(item.id) === productId);
    if (!product) throw new Error('Sản phẩm không còn trong catalog. Vui lòng tải lại giỏ hàng.');
    let remaining = requested;
    for (const batch of product.batches ?? product.inventory_batches ?? []) {
      const id = Number(batch.id);
      if (batch.is_open !== true || !Number.isSafeInteger(id) || id <= 0) continue;
      if (!left.has(id)) left.set(id, Number(batch.available_quantity ?? (Number(batch.initial_quantity) - Number(batch.approved_quantity))));
      const available = left.get(id)!;
      if (!Number.isFinite(available) || available <= 0) continue;
      const quantity = Math.round(Math.min(remaining, available) * 1000) / 1000;
      items.push(postId ? { batch_id: id, quantity, post_id: postId } : { batch_id: id, quantity });
      left.set(id, available - quantity);
      remaining = Math.max(0, Math.round((remaining - quantity) * 1000) / 1000);
      if (remaining < 0.000001) break;
    }
    if (remaining >= 0.000001) throw new Error('Không đủ hàng khả dụng cho một mặt hàng trong giỏ. Vui lòng giảm số lượng.');
  }
  if (!items.length) throw new Error('Giỏ hàng đang trống.');
  return items;
}

/** Monthly reports use Vietnam calendar boundaries and an inclusive final millisecond. */
export function reportRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Kỳ báo cáo không hợp lệ.');
  const [year, index] = month.split('-').map(Number);
  const next = index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
  return {
    date_from: new Date(`${month}-01T00:00:00+07:00`).toISOString(),
    date_to: new Date(new Date(`${next}-01T00:00:00+07:00`).getTime() - 1).toISOString(),
  };
}
