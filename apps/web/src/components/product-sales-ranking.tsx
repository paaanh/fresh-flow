import ProductPhoto from './product-photo';
import { rankProductSales, type SalesOrder } from '@/lib/product-sales';

export default function ProductSalesRanking({ orders, month, money }: { orders: SalesOrder[]; month: string; money: (value: number) => string }) {
  const { products, incompleteOrders } = rankProductSales(orders, month);
  const total = products.reduce((sum, product) => sum + product.revenue, 0);
  return <section className="panel p-5">
    <h3 className="font-bold">Sản phẩm bán chạy</h3>
    <p className="mt-1 text-xs text-slate-500">Xếp theo doanh thu sản phẩm từ đơn đã hoàn thành, đặt trong tháng đã chọn. Không gồm phí giao hàng.</p>
    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm"><span>Tổng doanh thu sản phẩm</span><b className="text-[#176b52]">{money(total)}</b></div>
    {products.length ? <ol className="mt-2">{products.map((product, index) => <li key={product.key} className="flex items-center gap-3 border-b py-4 last:border-0">
      <span className="w-6 shrink-0 text-xs font-bold text-[#176b52]">#{index + 1}</span>
      <ProductPhoto product={product} className="!h-8 !w-8 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1"><b className="block text-xs">{product.name}</b><span className="mt-1 block text-xs text-slate-500">Đã bán: {new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(product.quantity)} {product.unit}</span></div>
      <b className="shrink-0 text-xs text-[#176b52]">{money(product.revenue)}</b>
    </li>)}</ol> : <p className="py-6 text-center text-sm text-slate-500">Chưa có sản phẩm bán được từ đơn hoàn thành trong kỳ này.</p>}
    {incompleteOrders > 0 && <p className="mt-3 text-xs text-amber-700">Có {incompleteOrders} đơn hoàn thành thiếu ngày đặt hoặc chi tiết sản phẩm/giá. Các dữ liệu thiếu chưa được tính vào bảng.</p>}
  </section>;
}
