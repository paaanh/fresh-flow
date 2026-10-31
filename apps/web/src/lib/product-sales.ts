import type { OrderLine } from '@/components/order-items';

export type SalesOrder = { status: string; createdAt?: string; lines?: OrderLine[] };
export type ProductSales = { key: string; name: string; image?: string; quantity: number; unit: string; revenue: number };

export function salesMonth(date: string): string {
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).formatToParts(parsed);
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}`;
}

export function rankProductSales(orders: SalesOrder[], month: string) {
  const products = new Map<string, ProductSales>();
  let incompleteOrders = 0;
  for (const order of orders) {
    if (order.status !== 'Hoàn thành') continue;
    if (!order.createdAt || !salesMonth(order.createdAt)) { incompleteOrders++; continue; }
    if (salesMonth(order.createdAt) !== month) continue;
    if (!order.lines?.length) { incompleteOrders++; continue; }
    let incomplete = false;
    for (const line of order.lines) {
      if (line.price == null || !Number.isFinite(line.price) || line.price < 0 || !Number.isFinite(line.quantity) || line.quantity <= 0) { incomplete = true; continue; }
      const key = `${line.productId ?? line.name}:${line.unit}`;
      const existing = products.get(key) || { key, name: line.name, image: line.image, quantity: 0, unit: line.unit, revenue: 0 };
      existing.quantity += line.quantity;
      existing.revenue += line.quantity * line.price;
      products.set(key, existing);
    }
    if (incomplete) incompleteOrders++;
  }
  return { products: [...products.values()].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity || a.name.localeCompare(b.name, 'vi')), incompleteOrders };
}
