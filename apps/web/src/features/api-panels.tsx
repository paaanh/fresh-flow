'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { freshflow, type AddressIn, type UserOut } from '@/lib/api';
import { allocateOrderItems, type CatalogProduct } from '@/lib/order-payload';

type Address = AddressIn & { id: number };
type Slot = { id: number; name: string; fee: string | number; is_active: boolean };
export type CheckoutDetails = { delivery: string; addressId: number; note: string; deliverySlotId?: number | null };
const field = 'w-full rounded-lg border bg-white p-3 text-sm';
const button = 'rounded-lg bg-[#176b52] px-4 py-2 text-sm text-white disabled:opacity-50';
const message = (error: unknown) => error instanceof Error ? error.message : 'Không tải được dữ liệu từ máy chủ.';
const addressText = (address: Address) => [address.line1, address.ward, address.district, address.city].filter(Boolean).join(', ');

export function ApiDashboard({ admin, products, orders, requestCount, money, basePath = '' }: {
  admin: boolean; products: { id: number; name: string; available: number; unit: string }[];
  orders: { id: string; status: string; total: number }[]; requestCount: number; money: (value: number) => string; basePath?: string;
}) {
  const cards = [
    ['Đơn hàng trong danh sách', String(orders.length)],
    ['Đơn chờ duyệt', String(orders.filter(order => order.status === 'Chờ duyệt').length)],
    ['Sản phẩm trong catalog', String(products.length)],
    ['Yêu cầu mặt hàng', String(requestCount)],
  ];
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="panel p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>
    <section className="panel space-y-3 p-5"><h2 className="font-bold">Đơn hàng gần đây</h2>
      {orders.slice(0, 6).map(order => <Link key={order.id} href={`${basePath}/orders/${encodeURIComponent(order.id)}`} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"><b>{order.id}</b><span>{order.status}</span><span>{money(order.total)}</span></Link>)}
      {!orders.length && <p className="text-sm text-slate-500">Chưa có đơn hàng.</p>}
      <Link href={`${basePath}/orders`} className="block text-sm text-emerald-700">Xem tất cả đơn hàng</Link>
    </section>
    <section className="panel space-y-3 p-5"><h2 className="font-bold">{admin ? 'Tồn kho hiện tại' : 'Sản phẩm đang bán'}</h2>
      {products.slice(0, 8).map(product => <Link key={product.id} href={`${basePath}/products/${product.id}`} className="flex justify-between gap-2 border-b py-2 text-sm"><span>{product.name}</span><span>{product.available} {product.unit}</span></Link>)}
      <Link href={`${basePath}/products`} className="block text-sm text-emerald-700">Xem sản phẩm</Link>
    </section>
    {admin && <Link href={`${basePath}/reports`} className="block text-sm text-emerald-700">Xem báo cáo doanh thu</Link>}
  </div>;
}

export function ApiProfile() {
  const [user, setUser] = useState<UserOut>();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<AddressIn>({ label: 'Nhà', recipient: '', phone: '', line1: '', ward: '', district: '', city: '', is_default: false });
  useEffect(() => {
    let alive = true;
    Promise.all([freshflow.me(), freshflow.addresses<Address>()]).then(([profile, list]) => {
      if (!alive) return;
      setUser(profile); setAddresses(list);
      setDraft(current => ({ ...current, recipient: profile.full_name }));
    }).catch(error => { if (alive) setError(message(error)); });
    return () => { alive = false; };
  }, []);
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); setAddresses(await freshflow.addresses<Address>()); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-5 lg:grid-cols-2">
    <section className="panel space-y-4 p-5"><h2 className="font-bold">Hồ sơ của bạn</h2>
      {user ? <div className="space-y-3"><div><p className="text-xs text-slate-500">Họ và tên</p><p className="font-semibold">{user.full_name}</p></div><div><p className="text-xs text-slate-500">Email</p><p>{user.email}</p></div><div><p className="text-xs text-slate-500">Số điện thoại</p><p>{user.phone || 'Chưa cập nhật'}</p></div><div><p className="text-xs text-slate-500">Nhóm khách hàng</p><p>{user.customer_group === 'STUDENT' ? 'Sinh viên' : 'Người đi làm'}</p></div></div> : <p>Đang tải hồ sơ…</p>}
      <p className="text-xs text-slate-500">Thông tin hồ sơ được lấy từ tài khoản đang đăng nhập.</p>
    </section>
    <section className="panel space-y-4 p-5"><h2 className="font-bold">Địa chỉ giao hàng</h2>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {addresses.map(address => <div key={address.id} className="space-y-2 rounded-lg border p-3">
        <b>{address.label} {address.is_default && '· Mặc định'}</b><p className="text-sm">{address.recipient} · {address.phone}</p><p className="text-sm">{addressText(address)}</p>
        <div className="flex gap-4 text-xs">
          {!address.is_default && <button disabled={busy} onClick={() => mutate(() => freshflow.updateAddress(address.id, { label: address.label, recipient: address.recipient, phone: address.phone, line1: address.line1, ward: address.ward, district: address.district, city: address.city, is_default: true }))}>Đặt làm mặc định</button>}
          <button disabled={busy} onClick={() => mutate(() => freshflow.deleteAddress(address.id))}>Xóa</button>
        </div>
      </div>)}
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void mutate(() => freshflow.createAddress(draft)); }}>
        <h3 className="text-sm font-semibold">Thêm địa chỉ</h3>
        {([['label', 'Tên địa chỉ', false], ['recipient', 'Người nhận', true], ['phone', 'Số điện thoại', true], ['line1', 'Số nhà, đường', true], ['ward', 'Phường/xã', false], ['district', 'Quận/huyện', false], ['city', 'Tỉnh/thành phố', true]] as const).map(([key, label, required]) => <label key={key} className="block text-xs">{label}<input className={field} required={required} value={draft[key] || ''} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/></label>)}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_default} onChange={event => setDraft(current => ({ ...current, is_default: event.target.checked }))}/>Đặt làm mặc định</label>
        <button className={button} disabled={busy || !user}>{busy ? 'Đang lưu…' : 'Lưu địa chỉ'}</button>
      </form>
    </section>
  </div>;
}

export function ApiCheckout({ total, money, cart, done }: { total: number; money: (value: number) => string; cart: Record<number, number>; done: (details: CheckoutDetails) => Promise<boolean> }) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [addressId, setAddressId] = useState(0);
  const [slotId, setSlotId] = useState(0);
  const [pickup, setPickup] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [batchError, setBatchError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    Promise.all([freshflow.addresses<Address>(), freshflow.deliverySlots<Slot>(), freshflow.catalog<CatalogProduct>()]).then(([addresses, slots, catalog]) => {
      if (!alive) return;
      setAddresses(addresses); setSlots(slots.filter(slot => slot.is_active !== false));
      setAddressId(addresses.find(address => address.is_default)?.id || addresses[0]?.id || 0);
      try { allocateOrderItems(catalog, cart); setBatchError(''); }
      catch (error) { setBatchError(message(error)); }
      setLoaded(true);
    }).catch(error => { if (alive) setError(message(error)); });
    return () => { alive = false; };
  }, [cart]);
  const fee = Number(slots.find(slot => slot.id === slotId)?.fee || 0);
  return <form className="panel mx-auto max-w-2xl space-y-4 p-5" onSubmit={async event => {
    event.preventDefault(); setBusy(true);
    try { await done({ delivery: pickup ? 'Điểm giao tập trung' : 'Giao riêng', addressId, deliverySlotId: slotId || null, note }); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }}>
    <h2 className="font-bold">Xác nhận đơn hàng</h2>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {batchError && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Chưa thể gửi đơn: backend chưa cung cấp mã lô hàng khả dụng cho catalog khách hàng. {batchError}</p>}
    <label className="block text-sm">Phương thức nhận hàng<select className={field} value={pickup ? 'pickup' : 'delivery'} onChange={event => setPickup(event.target.value === 'pickup')}><option value="pickup">Nhận tại điểm giao</option><option value="delivery">Giao đến địa chỉ</option></select></label>
    {!pickup && <label className="block text-sm">Địa chỉ<select className={field} required value={addressId || ''} onChange={event => setAddressId(Number(event.target.value))}><option value="">Chọn địa chỉ</option>{addresses.map(address => <option key={address.id} value={address.id}>{address.label}: {addressText(address)}</option>)}</select><Link href="/profile" className="text-xs text-emerald-700">Quản lý địa chỉ</Link></label>}
    <label className="block text-sm">Khung giao hàng<select className={field} value={slotId} onChange={event => setSlotId(Number(event.target.value))}><option value={0}>Không chọn khung giao</option>{slots.map(slot => <option key={slot.id} value={slot.id}>{slot.name} · {money(Number(slot.fee))}</option>)}</select></label>
    <label className="block text-sm">Ghi chú<textarea className={field} value={note} onChange={event => setNote(event.target.value)} maxLength={300}/></label>
    <p className="text-sm">Tạm tính: {money(total)} · Phí theo khung giao: {money(fee)}</p><p className="font-bold">Tổng dự kiến: {money(total + fee)}</p>
    <p className="text-xs text-slate-500">Giá và phí cuối cùng được cửa hàng xác nhận khi tạo đơn.</p>
    <button className={button} disabled={!loaded || busy || Boolean(batchError) || (!pickup && !addressId)}>{busy ? 'Đang gửi…' : 'Gửi đơn hàng'}</button>
  </form>;
}
