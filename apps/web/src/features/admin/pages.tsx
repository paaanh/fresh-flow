'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faTruck } from '@fortawesome/free-solid-svg-icons';
import { Badge, Button } from '@/features/customer/pages/shared-ui';
import ProductPhoto from '@/components/product-photo';
import InventoryAdjustment, { type AdjustStock } from '@/components/inventory-adjustment';
import { api, endpoints, unwrapList, freshflow } from '@/lib/api';
import type { Order, Product } from '@/types/domain';

export function InventoryView({ products, money, adjust }: {
  products: Product[];
  money: (value: number) => string;
  adjust: AdjustStock;
}) {
  const lowStock = products.filter(product => product.available < 10).length;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Mặt hàng đang theo dõi', String(products.length)],
          ['Sắp hết hàng', String(lowStock)],
          ['Đơn vị đang chờ duyệt', String(products.reduce((sum, product) => sum + product.ordered, 0))],
        ].map(([label, value]) => (
          <div key={label} className="panel p-5">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-extrabold text-[#1e2e26]">{value}</div>
          </div>
        ))}
      </div>
      <div className="panel overflow-hidden">
        <div className="border-b border-[#f1f5f2] p-4">
          <h2 className="text-sm font-bold text-[#1f2d25]">Tồn kho theo đợt hàng</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">Số lượng khả dụng = số lượng ban đầu trừ số lượng đã duyệt.</p>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-[#f8faf8] text-[10px] uppercase text-slate-400">
              <tr>{['Mặt hàng', 'Ban đầu', 'Đã duyệt / bán', 'Đang chờ duyệt', 'Khả dụng', 'Giá trị tồn', 'Điều chỉnh'].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id} className="border-t border-[#f0f4f1]">
                  <td className="px-5 py-3 font-bold"><ProductPhoto product={product} className="mr-2 inline-block !h-10 !w-10 shrink-0 align-middle" />{product.name}</td>
                  <td className="px-5">{product.available + product.approved} {product.unit}</td>
                  <td className="px-5 font-semibold text-[#537b5e]">{product.approved} {product.unit}</td>
                  <td className="px-5 text-amber-600">{product.ordered} {product.unit}</td>
                  <td className="px-5 font-extrabold text-[#176b52]">{product.available} {product.unit}</td>
                  <td className="px-5 text-slate-500">{money(product.available * product.price)}</td>
                  <td className="px-5 py-3"><InventoryAdjustment id={product.id} name={product.name} unit={product.unit} available={product.available} adjust={adjust} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && <p className="p-8 text-center text-xs text-slate-400">Chưa có dữ liệu tồn kho.</p>}
        </div>
      </div>
    </div>
  );
}

export function Deliveries({ orders, money, change, statusTone }: {
  orders: Order[];
  money: (value: number) => string;
  change: (id: string, status: string) => void;
  statusTone: (status: string) => string;
}) {
  const activeOrders = orders.filter(order => ['Đang chuẩn bị', 'Chờ Shipper lấy hàng', 'Đang giao'].includes(order.status));
  return (
    <div className="space-y-3">
      {activeOrders.map(order => (
        <div className="panel flex flex-wrap items-center gap-4 p-5" key={order.id}>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eaf4ed] text-[#176b52]"><FontAwesomeIcon icon={faTruck} /></div>
          <div className="min-w-[180px] flex-1">
            <div className="flex items-center gap-2"><b className="text-sm font-extrabold text-[#1e2e26]">{order.id}</b><Badge tone={statusTone(order.status)}>{order.status}</Badge></div>
            <div className="mt-1 text-xs text-slate-500">{order.customer} · {order.delivery}</div>
            <div className="mt-1 text-[10px] text-slate-400">{order.items} · {money(order.total)}</div>
          </div>
          <Button kind="secondary" onClick={() => change(order.id, order.status === 'Đang chuẩn bị' ? 'Đang giao' : 'Hoàn thành')}>
            {order.status === 'Đang chuẩn bị' ? 'Bắt đầu giao' : 'Hoàn tất giao'} <FontAwesomeIcon icon={faArrowRight} />
          </Button>
        </div>
      ))}
      {activeOrders.length === 0 && <div className="panel p-8 text-center text-xs text-slate-400">Không có đơn hàng đang điều phối giao.</div>}
    </div>
  );
}

type Customer = { id: number; initials: string; name: string; email: string; group: string; orders: number | null; status: string };

export function CustomersView({ notify, apiState }: { notify: (message: string) => void; apiState: string }) {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    if (apiState !== 'live') return;
    let alive = true;
    api.get<any>(endpoints.customers).then(result => {
      if (!alive) return;
      setCustomers(unwrapList<any>(result).map(item => ({
        id: Number(item.id),
        initials: (item.full_name || item.name || '?').slice(0, 2).toUpperCase(),
        name: item.full_name || item.name || '',
        email: item.email || '',
        group: item.customer_group?.name || item.customer_group || '',
        orders: typeof item.order_count === 'number' ? item.order_count : null,
        status: item.is_active ? 'Hoạt động' : 'Tạm khóa',
      })));
    }).catch(() => { if (alive) notify('Không tải được danh sách khách hàng.'); });
    return () => { alive = false; };
  }, [apiState]);

  const visible = customers.filter(customer => `${customer.name} ${customer.email}`.toLowerCase().includes(query.toLowerCase()));
  const toggle = async (customer: Customer) => {
    const active = customer.status !== 'Hoạt động';
    try {
      await freshflow.userStatus(customer.id, active);
      setCustomers(current => current.map(item => item.id === customer.id ? { ...item, status: active ? 'Hoạt động' : 'Tạm khóa' } : item));
      notify('Đã cập nhật trạng thái tài khoản.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Không cập nhật được tài khoản.'); }
  };

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f4f1] p-4">
        <div><b className="text-sm text-[#1e2e26]">Khách hàng & nhóm áp dụng giá</b><p className="mt-0.5 text-[11px] text-slate-400">Quản lý nhóm và trạng thái tài khoản.</p></div>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm kiếm khách hàng..." className="rounded-xl border border-[#d2ddd5] px-3 py-1.5 text-xs focus:outline-none" />
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="bg-[#f8faf8] text-[10px] uppercase text-slate-400"><tr>{['Khách hàng', 'Nhóm khách hàng', 'Trạng thái', 'Hành động'].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead>
          <tbody>{visible.map(customer => (
            <tr key={customer.id} className="border-t border-[#f0f4f1]">
              <td className="px-5 py-3 font-semibold text-[#1e2e26]">{customer.name}<div className="text-[10px] font-normal text-slate-400">{customer.email}</div></td>
              <td className="px-5"><Badge tone={customer.group === 'STUDENT' || customer.group === 'Sinh viên' ? 'blue' : 'gray'}>{customer.group}</Badge></td>
              <td className="px-5"><Badge tone={customer.status === 'Hoạt động' ? 'green' : 'red'}>{customer.status}</Badge></td>
              <td className="px-5"><button onClick={() => void toggle(customer)} className="font-bold text-[#176b52] hover:underline">{customer.status === 'Hoạt động' ? 'Khóa' : 'Mở khóa'}</button></td>
            </tr>
          ))}</tbody>
        </table>
        {visible.length === 0 && <p className="p-8 text-center text-xs text-slate-400">Không có khách hàng phù hợp.</p>}
      </div>
    </div>
  );
}

export function ReportsPanel({ money, orders }: { money: (value: number) => string; apiState: string; orders: Order[] }) {
  const completed = orders.filter(order => order.status === 'Hoàn thành');
  const active = orders.filter(order => order.status !== 'Hoàn thành' && order.status !== 'Đã hủy');
  const cancelled = orders.filter(order => order.status === 'Đã hủy');
  const cards = [
    ['Tổng doanh thu thực nhận', money(completed.reduce((sum, order) => sum + order.total, 0))],
    ['Đơn hoàn thành', String(completed.length)],
    ['Đơn đang vận hành', String(active.length)],
    ['Đơn đã hủy', String(cancelled.length)],
  ];
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="panel p-5"><span className="text-xs text-slate-400">{label}</span><div className="mt-2 text-xl font-extrabold text-[#1e2e26]">{value}</div></div>)}</div>;
}

export function ModerationView({ notify }: { notify: (msg: string) => void }) {
  const [term, setTerm] = useState('');
  const [terms, setTerms] = useState<string[]>(['hỏng', 'lừa đảo', 'hàng giả', 'thối rữa']);
  const [busy, setBusy] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    setBusy(true);
    try {
      await freshflow.addModerationTerm(term.trim());
      setTerms(prev => [...prev, term.trim()]);
      setTerm('');
      notify('Đã thêm từ khóa kiểm duyệt nội dung.');
    } catch (err: any) {
      notify(err?.message || 'Không thêm được từ khóa.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-6 space-y-6">
      <div>
        <h2 className="text-base font-extrabold text-[#1e2e26]">Kiểm duyệt nội dung tự động</h2>
        <p className="mt-1 text-xs text-slate-500">Chặn các bài đăng, bình luận hoặc tin nhắn chứa từ ngữ vi phạm quy định sàn.</p>
      </div>

      <form onSubmit={handleAdd} className="flex gap-3 max-w-md">
        <input
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Nhập từ khóa cần chặn..."
          className="flex-1 rounded-xl border border-[#d2ddd5] px-3.5 py-2 text-xs focus:outline-none focus:border-[#176b52]"
        />
        <Button disabled={busy}>{busy ? 'Đang thêm…' : 'Thêm từ khóa'}</Button>
      </form>

      <div>
        <h3 className="text-xs font-bold text-slate-600 mb-3">Từ khóa đang được kiểm duyệt ({terms.length})</h3>
        <div className="flex flex-wrap gap-2">
          {terms.map((t, idx) => (
            <span key={idx} className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700">
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SettingsView() {
  return (
    <div className="space-y-6">
      <div className="panel p-6 space-y-4">
        <h2 className="text-base font-extrabold text-[#1e2e26]">Cài đặt hệ thống FreshFlow</h2>
        <p className="text-xs text-slate-500">Cấu hình thông số kỹ thuật, API và thông báo sàn.</p>
        <div className="grid gap-4 sm:grid-cols-2 text-xs">
          <div className="rounded-xl border border-slate-100 p-4 bg-slate-50">
            <span className="font-bold text-slate-700">Phiên bản nền tảng:</span>
            <div className="mt-1 text-slate-500">FreshFlow v0.1.0 Enterprise</div>
          </div>
          <div className="rounded-xl border border-slate-100 p-4 bg-slate-50">
            <span className="font-bold text-slate-700">Môi trường API:</span>
            <div className="mt-1 text-slate-500">FastAPI + Next.js App Router</div>
          </div>
          <div className="rounded-xl border border-slate-100 p-4 bg-slate-50">
            <span className="font-bold text-slate-700">Realtime WebSocket:</span>
            <div className="mt-1 text-emerald-600 font-semibold">Kích hoạt (SSE / WS Event Bus)</div>
          </div>
          <div className="rounded-xl border border-slate-100 p-4 bg-slate-50">
            <span className="font-bold text-slate-700">Bảo mật giao dịch:</span>
            <div className="mt-1 text-slate-500">JWT Token Auth + Role-Based Access Control</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminNotificationsView({
  notifications,
  notify,
  onReload,
  markRead,
  clearAll,
}: {
  notifications: { id: number; title: string; body: string; event_type: string; is_read: boolean; created_at?: string }[];
  notify: (msg: string) => void;
  onReload?: () => void;
  markRead: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetRole, setTargetRole] = useState<'ALL' | 'CUSTOMER' | 'SHOP' | 'SHIPPER'>('ALL');
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setSuccessMsg('');
    try {
      const res = await freshflow.broadcastNotification<{ message: string; recipients_count: number }>({
        title: title.trim(),
        body: body.trim(),
        target_role: targetRole === 'ALL' ? null : targetRole,
      });
      const msg = res?.message || 'Đã gửi thông báo đến toàn bộ người dùng.';
      setSuccessMsg(msg);
      notify(msg);
      setTitle('');
      setBody('');
      onReload?.();
    } catch (err: any) {
      notify(err?.message || 'Không thể gửi thông báo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Broadcast Form Panel */}
      <section className="panel p-6 space-y-5">
        <div className="border-b border-[#f0f4f1] pb-3">
          <h2 className="text-base font-extrabold text-[#1e2e26]">Gửi thông báo toàn hệ thống</h2>
          <p className="mt-1 text-xs text-slate-500">
            Phát thông báo đẩy đến tất cả người dùng hoặc lọc theo vai trò (Khách hàng, Cửa hàng, Tài xế).
          </p>
        </div>

        {successMsg && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs font-semibold text-emerald-800">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleBroadcast} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#3d5045] mb-1">Đối tượng nhận thông báo</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                { id: 'ALL', label: 'Tất cả người dùng' },
                { id: 'CUSTOMER', label: 'Chỉ Khách hàng' },
                { id: 'SHOP', label: 'Chỉ Cửa hàng (Shop)' },
                { id: 'SHIPPER', label: 'Chỉ Tài xế (Shipper)' },
              ].map(opt => (
                <label
                  key={opt.id}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer text-xs font-semibold ${
                    targetRole === opt.id
                      ? 'border-[#176b52] bg-[#f4f9f6] text-[#176b52]'
                      : 'border-[#e8ede8] text-[#55695f] hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="targetRole"
                    checked={targetRole === opt.id}
                    onChange={() => setTargetRole(opt.id as any)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#3d5045] mb-1">Tiêu đề thông báo *</label>
            <input
              required
              minLength={2}
              maxLength={160}
              placeholder="Ví dụ: Lịch bảo trì hệ thống hoặc Ưu đãi nông sản hôm nay..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#3d5045] mb-1">Nội dung chi tiết *</label>
            <textarea
              required
              minLength={2}
              maxLength={2000}
              rows={3}
              placeholder="Nội dung thông báo gửi đến người dùng..."
              value={body}
              onChange={e => setBody(e.target.value)}
              className="w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#176b52] px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-[#125340] disabled:opacity-50"
            >
              {busy ? 'Đang gửi thông báo…' : 'Phát thông báo ngay'}
            </button>
          </div>
        </form>
      </section>

      {/* Notifications List */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#1e2e26]">Hộp thư thông báo của bạn</h3>
            <p className="text-[11px] text-slate-400">Xem và quản lý các thông báo nhận được</p>
          </div>
          <button onClick={() => void clearAll()} className="text-xs font-bold text-[#176b52] hover:underline">
            Đánh dấu tất cả đã đọc
          </button>
        </div>

        {notifications.length === 0 && (
          <div className="panel p-10 text-center text-sm text-slate-500">Chưa có thông báo nào.</div>
        )}

        {notifications.map(item => (
          <article
            key={item.id}
            className={`panel flex items-start gap-3 p-4 ${
              item.is_read ? 'opacity-70' : 'border-emerald-200 bg-emerald-50/40'
            }`}
          >
            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-[#1f2d25]">{item.title}</h4>
                {item.event_type === 'system.broadcast' && (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
                    Toàn sàn
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600">{item.body}</p>
              <time className="mt-2 block text-[10px] text-slate-400">
                {item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : item.event_type}
              </time>
            </div>
            {!item.is_read && (
              <button
                onClick={() => void markRead(item.id)}
                className="text-xs font-semibold text-[#176b52] hover:underline shrink-0"
              >
                Đã đọc
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
