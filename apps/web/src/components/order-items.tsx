import ProductPhoto from './product-photo';

export type OrderLine = {
  productId?: number;
  name: string;
  image?: string;
  unit: string;
  quantity: number;
  price?: number;
};

export function normalizeOrderLines(items: unknown): OrderLine[] {
  if (!Array.isArray(items)) return [];
  return items.map(item => {
    const product = item.product || {};
    const price = item.unit_price ?? item.price;
    return {
      productId: item.product_id ?? product.id,
      name: item.product_name_snapshot ?? item.product_name ?? item.name ?? product.name ?? 'Sản phẩm',
      image: item.image_url ?? item.image ?? product.image_url ?? product.image,
      unit: item.unit_snapshot ?? item.unit_name ?? (typeof item.unit === 'string' ? item.unit : item.unit?.name) ?? (typeof product.unit === 'string' ? product.unit : product.unit?.name) ?? '',
      quantity: Number(item.quantity ?? 0),
      price: price == null ? undefined : Number(price),
    };
  });
}

export default function OrderItems({ lines, money }: { lines?: OrderLine[]; money: (value: number) => string }) {
  if (!lines?.length) return <p className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">Đơn hàng này chưa có dữ liệu chi tiết sản phẩm. Các đơn demo cũ chỉ lưu tổng tiền và số lượng; đơn mới sẽ lưu từng mặt hàng.</p>;
  return <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm">
    <thead className="border-b bg-white text-xs text-slate-500"><tr><th className="p-3">Sản phẩm</th><th className="p-3 text-right">Số lượng</th><th className="p-3 text-right">Đơn giá</th><th className="p-3 text-right">Thành tiền</th></tr></thead>
    <tbody>{lines.map((line, index) => <tr key={`${line.productId ?? 'item'}-${index}`} className="border-b last:border-0">
      <td className="p-3"><div className="flex items-center gap-3"><ProductPhoto product={line} className="!h-12 !w-12 shrink-0 rounded-xl" /><span className="font-semibold">{line.name}</span></div></td>
      <td className="whitespace-nowrap p-3 text-right">{line.quantity} {line.unit}</td>
      <td className="whitespace-nowrap p-3 text-right">{line.price == null ? '—' : money(line.price)}</td>
      <td className="whitespace-nowrap p-3 text-right font-semibold text-[#176b52]">{line.price == null ? '—' : money(line.price * line.quantity)}</td>
    </tr>)}</tbody>
  </table></div>;
}
