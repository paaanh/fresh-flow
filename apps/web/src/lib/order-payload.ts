import type { OrderCreateIn } from './api';

type CatalogBatch = {
  id: number; is_open: boolean; available_quantity?: number | string;
  initial_quantity?: number | string; approved_quantity?: number | string;
};
export type CatalogProduct = { id: number; batches?: CatalogBatch[]; inventory_batches?: CatalogBatch[] };

/** The documented customer catalog must expose real batch IDs before checkout can submit. */
export function allocateOrderItems(catalog: CatalogProduct[], cart: Record<number, number>): OrderCreateIn['items'] {
  const items: OrderCreateIn['items'] = [];
  const used = new Set<number>();
  for (const [productId, requested] of Object.entries(cart)) {
    if (!Number.isFinite(requested) || requested <= 0) throw new Error('Số lượng đặt hàng phải lớn hơn 0.');
    const product = catalog.find(item => Number(item.id) === Number(productId));
    if (!product) throw new Error('Sản phẩm không còn trong catalog. Vui lòng tải lại giỏ hàng.');
    let remaining = requested;
    for (const batch of product.batches ?? product.inventory_batches ?? []) {
      const id = Number(batch.id);
      if (batch.is_open !== true || !Number.isSafeInteger(id) || id <= 0 || used.has(id)) continue;
      const available = Number(batch.available_quantity ?? (Number(batch.initial_quantity) - Number(batch.approved_quantity)));
      if (!Number.isFinite(available) || available <= 0) continue;
      const quantity = Math.min(remaining, available);
      items.push({ batch_id: id, quantity });
      used.add(id);
      remaining = Math.max(0, remaining - quantity);
      if (remaining < 0.000001) break;
    }
    if (remaining >= 0.000001) throw new Error('Catalog chưa cung cấp đủ lô hàng khả dụng (batch_id). Cần backend bổ sung dữ liệu lô hàng cho khách.');
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
