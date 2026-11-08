'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { freshflow, type AddressIn, type UserOut } from '@/lib/api';
import { allocateOrderItems, type CatalogProduct } from '@/lib/order-payload';

type Address = AddressIn & { id: number };
type Slot = { id: number; name: string; fee: string | number; start_time?: string; end_time?: string; is_active: boolean };
export type CheckoutDetails = {
  delivery: string;
  addressId: number;
  note: string;
  deliverySlotId?: number | null;
  paymentMethod?: string;
  vatRate?: number;
  vatAmount?: number;
  totalWithVat?: number;
};

const field = 'w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none';
const button = 'rounded-xl bg-[#176b52] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#125340] disabled:opacity-50';
const message = (error: unknown) => error instanceof Error ? error.message : 'Không tải được dữ liệu từ máy chủ.';
const addressText = (address: Address) => [address.line1, address.ward, address.district, address.city].filter(Boolean).join(', ');

export function ApiDashboard({ admin, products, orders, requestCount, money, basePath = '' }: {
  admin: boolean; products: { id: number; name: string; available: number; unit: string }[];
  orders: { id: string; status: string; total: number }[]; requestCount: number; money: (value: number) => string; basePath?: string;
}) {
  const cards = [
    ['Đơn hàng trong danh sách', String(orders.length)],
    ['Đơn chờ duyệt', String(orders.filter(order => order.status === 'Chờ duyệt' || order.status === 'PENDING').length)],
    ['Sản phẩm trong catalog', String(products.length)],
    ['Yêu cầu mặt hàng', String(requestCount)],
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="panel p-5">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-extrabold text-[#1f2d25]">{value}</p>
          </div>
        ))}
      </div>
      <section className="panel space-y-3 p-5">
        <h2 className="font-extrabold text-sm text-[#1f2d25]">Đơn hàng gần đây</h2>
        {orders.slice(0, 6).map(order => (
          <Link key={order.id} href={`${basePath}/orders/${encodeURIComponent(order.id)}`} className="flex flex-wrap justify-between gap-2 rounded-xl border border-[#e8ede8] p-3 text-xs transition hover:bg-slate-50">
            <b className="text-[#176b52]">{order.id}</b>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{order.status}</span>
            <span className="font-extrabold">{money(order.total)}</span>
          </Link>
        ))}
        {!orders.length && <p className="text-xs text-slate-500">Chưa có đơn hàng nào.</p>}
        <Link href={`${basePath}/orders`} className="block text-xs font-bold text-[#176b52] hover:underline">Xem tất cả đơn hàng →</Link>
      </section>
      <section className="panel space-y-3 p-5">
        <h2 className="font-extrabold text-sm text-[#1f2d25]">{admin ? 'Tồn kho hiện tại' : 'Sản phẩm đang bán'}</h2>
        {products.slice(0, 8).map(product => (
          <Link key={product.id} href={`${basePath}/products/${product.id}`} className="flex justify-between gap-2 border-b border-[#f1f5f2] py-2.5 text-xs">
            <span className="font-semibold text-[#23352a]">{product.name}</span>
            <span className="text-[#64756b]">{product.available} {product.unit}</span>
          </Link>
        ))}
        <Link href={`${basePath}/products`} className="block text-xs font-bold text-[#176b52] hover:underline">Xem sản phẩm →</Link>
      </section>
      {admin && <Link href={`${basePath}/reports`} className="block text-xs font-bold text-[#176b52] hover:underline">Xem báo cáo doanh thu & đối soát →</Link>}
    </div>
  );
}

export function ApiProfile() {
  const [user, setUser] = useState<UserOut>();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [profileDraft, setProfileDraft] = useState({ full_name: '', phone: '', shop_name: '', shop_description: '', shop_address: '', vehicle_info: '' });
  const [draft, setDraft] = useState<AddressIn>({ label: 'Nhà', recipient: '', phone: '', line1: '', ward: '', district: '', city: '', is_default: false });
  const [verifyModal, setVerifyModal] = useState<{ target: string; purpose: string; demoCode: string; code: string } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const handleStartVerify = async (target: string, purpose: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await freshflow.requestOtp(target, purpose);
      setVerifyModal({ target, purpose, demoCode: res.otp_code || '123456', code: '' });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyModal || !verifyModal.code.trim()) return;
    setVerifying(true);
    setVerifyError('');
    try {
      await freshflow.verifyOtp(verifyModal.target, verifyModal.code.trim(), verifyModal.purpose);
      if (user) {
        if (verifyModal.purpose.includes('email') || verifyModal.target.includes('@')) {
          setUser({ ...user, is_email_verified: true });
        } else {
          setUser({ ...user, is_phone_verified: true });
        }
      }
      setSuccess(`Đã xác thực thành công ${verifyModal.target}!`);
      setVerifyModal(null);
    } catch (err) {
      setVerifyError(message(err));
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    let alive = true;
    Promise.all([freshflow.me(), freshflow.addresses<Address>()]).then(([profile, list]) => {
      if (!alive) return;
      setUser(profile); setAddresses(list);
      setProfileDraft({ full_name: profile.full_name, phone: profile.phone || '', shop_name: profile.shop_name || '', shop_description: profile.shop_description || '', shop_address: profile.shop_address || '', vehicle_info: profile.vehicle_info || '' });
      setDraft(current => ({ ...current, recipient: profile.full_name, phone: profile.phone || '' }));
    }).catch(error => { if (alive) setError(message(error)); });
    return () => { alive = false; };
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      const updated = await freshflow.updateProfile({
        full_name: profileDraft.full_name.trim(),
        phone: profileDraft.phone.trim() || null,
        ...(user?.role === 'SHOP' ? { shop_name: profileDraft.shop_name.trim(), shop_description: profileDraft.shop_description.trim(), shop_address: profileDraft.shop_address.trim() } : {}),
        ...(user?.role === 'SHIPPER' ? { vehicle_info: profileDraft.vehicle_info.trim() } : {}),
      });
      setUser(updated);
      setProfileDraft(current => ({ ...current, full_name: updated.full_name, phone: updated.phone || '' }));
      setDraft(current => ({ ...current, recipient: updated.full_name, phone: updated.phone || '' }));
      setSuccess('Đã cập nhật hồ sơ.');
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }

  async function addAddress(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      const created = await freshflow.createAddress<Address>(draft);
      setAddresses(current => [...current, created]);
      setSuccess('Đã thêm địa chỉ giao hàng mới.');
      setDraft({ label: 'Nhà', recipient: user?.full_name || '', phone: user?.phone || '', line1: '', ward: '', district: '', city: '', is_default: false });
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }

  async function removeAddress(id: number) {
    setBusy(true); setError(''); setSuccess('');
    try {
      await freshflow.deleteAddress(id);
      setAddresses(current => current.filter(item => item.id !== id));
      setSuccess('Đã xóa địa chỉ.');
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {user && (
        <section className="panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-[#1a2d24]">{user.full_name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-[#7d8f85]">
                <div className="flex items-center gap-1.5">
                  <span>{user.email}</span>
                  {user.is_email_verified ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      ✓ Đã xác thực email
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleStartVerify(user.email, 'verify_email')}
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-200"
                    >
                      Xác thực email
                    </button>
                  )}
                </div>
                <span>·</span>
                <div className="flex items-center gap-1.5">
                  <span>{user.phone || 'Chưa thêm SĐT'}</span>
                  {user.phone ? (
                    user.is_phone_verified ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        ✓ Đã xác thực SĐT
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleStartVerify(user.phone!, 'verify_phone')}
                        className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-200"
                      >
                        Xác thực SĐT
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            </div>
            <span className="rounded-full bg-[#e8f5ec] px-3 py-1 text-xs font-bold text-[#176b52]">
              Vai trò: {user.role === 'ADMIN' ? 'Quản trị viên' : user.role === 'SHOP' ? 'Cửa hàng (Shop)' : user.role === 'SHIPPER' ? 'Giao hàng (Shipper)' : 'Khách hàng'}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-[#f8faf8] p-4 text-xs">
            {user.role === 'CUSTOMER' ? (
              <div>
                <span className="text-[#819287]">Nhóm khách hàng:</span>
                <div className="font-bold text-[#1e2d25]">{user.customer_group}</div>
              </div>
            ) : (
              <div>
                <span className="text-[#819287]">Trạng thái tài khoản:</span>
                <div className="font-bold text-emerald-700">{user.is_active ? 'Đang hoạt động' : 'Tạm khóa'}</div>
              </div>
            )}
            {user.role === 'SHOP' && (
              <div>
                <span className="text-[#819287]">Tên Shop:</span>
                <div className="font-bold text-[#176b52]">{user.shop_name || 'Chưa đặt tên'}</div>
              </div>
            )}
            {user.role === 'SHIPPER' && (
              <div>
                <span className="text-[#819287]">Phương tiện giao hàng:</span>
                <div className="font-bold text-[#205493]">{user.vehicle_info || 'Xe máy'}</div>
              </div>
            )}
          </div>
          {success && <p className="mt-3 text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-lg">{success}</p>}
          {error && <p className="mt-3 text-xs text-rose-700 bg-rose-50 p-2.5 rounded-lg">{error}</p>}
          <form onSubmit={saveProfile} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Họ và tên<input required minLength={2} maxLength={120} value={profileDraft.full_name} onChange={e => setProfileDraft({ ...profileDraft, full_name: e.target.value })} className={field} /></label>
              <label className="text-xs font-semibold text-slate-600">Số điện thoại<input maxLength={30} value={profileDraft.phone} onChange={e => setProfileDraft({ ...profileDraft, phone: e.target.value })} className={field} /></label>
              {user.role === 'SHOP' && <>
                <label className="text-xs font-semibold text-slate-600">Tên cửa hàng<input maxLength={150} value={profileDraft.shop_name} onChange={e => setProfileDraft({ ...profileDraft, shop_name: e.target.value })} className={field} /></label>
                <label className="text-xs font-semibold text-slate-600">Địa chỉ cửa hàng<input maxLength={255} value={profileDraft.shop_address} onChange={e => setProfileDraft({ ...profileDraft, shop_address: e.target.value })} className={field} /></label>
                <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Giới thiệu cửa hàng<textarea maxLength={5000} value={profileDraft.shop_description} onChange={e => setProfileDraft({ ...profileDraft, shop_description: e.target.value })} className={field} /></label>
              </>}
              {user.role === 'SHIPPER' && <label className="text-xs font-semibold text-slate-600">Phương tiện giao hàng<input maxLength={100} value={profileDraft.vehicle_info} onChange={e => setProfileDraft({ ...profileDraft, vehicle_info: e.target.value })} className={field} /></label>}
            </div>
            <button disabled={busy} className={button}>{busy ? 'Đang lưu…' : 'Lưu hồ sơ'}</button>
          </form>
        </section>
      )}

      {user?.role === 'CUSTOMER' && (
        <section className="panel p-6 space-y-4">
          <h3 className="text-sm font-extrabold text-[#1a2d24]">Sổ địa chỉ nhận hàng</h3>

          <div className="space-y-3">
            {addresses.map(a => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-[#e8ede8] p-3.5 text-xs">
                <div>
                  <div className="font-bold text-[#1e2d25]">
                    {a.label} {a.is_default && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-[#176b52]">Mặc định</span>}
                  </div>
                  <div className="mt-0.5 text-[#5e7065]">{addressText(a)} · {a.recipient} ({a.phone})</div>
                </div>
                <button onClick={() => removeAddress(a.id)} className="text-xs text-rose-600 hover:underline">Xóa</button>
              </div>
            ))}
            {addresses.length === 0 && <p className="text-xs text-[#809187]">Bạn chưa lưu địa chỉ nào.</p>}
          </div>

          <form onSubmit={addAddress} className="mt-4 border-t border-[#f0f4f1] pt-4 space-y-3">
            <h4 className="text-xs font-bold text-[#3d5045]">Thêm địa chỉ mới</h4>
            <div className="grid grid-cols-2 gap-3">
              <input required placeholder="Tên gợi nhớ (Nhà, Cơ quan...)" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} className={field} />
              <input required placeholder="Người nhận" value={draft.recipient} onChange={e => setDraft({ ...draft, recipient: e.target.value })} className={field} />
              <input required placeholder="Số điện thoại" value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} className={field} />
              <input required placeholder="Số nhà, đường" value={draft.line1} onChange={e => setDraft({ ...draft, line1: e.target.value })} className={field} />
              <input placeholder="Phường/Xã" value={draft.ward} onChange={e => setDraft({ ...draft, ward: e.target.value })} className={field} />
              <input placeholder="Quận/Huyện" value={draft.district} onChange={e => setDraft({ ...draft, district: e.target.value })} className={field} />
              <input required placeholder="Tỉnh/Thành phố" value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })} className={field} />
              <label className="flex items-center gap-2 text-xs text-[#526359] self-center">
                <input type="checkbox" checked={draft.is_default} onChange={e => setDraft({ ...draft, is_default: e.target.checked })} />
                Đặt làm mặc định
              </label>
            </div>
            <button type="submit" disabled={busy} className={button}>{busy ? 'Đang lưu…' : 'Thêm địa chỉ'}</button>
          </form>
        </section>
      )}

      {/* Modal Xác thực OTP */}
      {verifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-[#1a2d24]">
              Xác thực {verifyModal.target.includes('@') ? 'Email' : 'Số điện thoại'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Nhập mã OTP 6 chữ số gửi đến: <b>{verifyModal.target}</b>
            </p>

            {verifyModal.demoCode && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-center text-xs text-emerald-900">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Mã xác thực thử nghiệm</span>
                <span className="font-mono text-base font-extrabold tracking-widest text-[#176b52]">
                  {verifyModal.demoCode}
                </span>
              </div>
            )}

            {verifyError && (
              <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{verifyError}</p>
            )}

            <form onSubmit={handleConfirmVerify} className="mt-4 space-y-3">
              <input
                required
                maxLength={8}
                value={verifyModal.code}
                onChange={e => setVerifyModal({ ...verifyModal, code: e.target.value })}
                placeholder="Nhập mã 6 số..."
                className="w-full rounded-xl border border-[#d2ddd5] p-3 text-center font-mono text-lg font-bold tracking-widest outline-none focus:border-[#176b52]"
              />

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVerifyModal(null)}
                  className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={verifying}
                  className="rounded-xl bg-[#176b52] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#125340] disabled:opacity-50"
                >
                  {verifying ? 'Đang xác thực…' : 'Xác nhận OTP'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function ApiCheckout({ money, total, cart, done }: {
  money: (value: number) => string; total: number; cart: Record<number, number>;
  done: (details: CheckoutDetails) => Promise<boolean>;
}) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [addressId, setAddressId] = useState(0);
  const [slotId, setSlotId] = useState(0);
  const [pickup, setPickup] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState('COD');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [batchError, setBatchError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vatRate, setVatRate] = useState(0.08);

  const selectedSlot = slots.find(slot => slot.id === slotId);
  const fee = pickup ? Number(selectedSlot?.fee || 0) : Number(selectedSlot ? selectedSlot.fee : 20000);
  const vatAmount = Math.round(total * vatRate);
  const grandTotal = total + vatAmount + fee;

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    freshflow.vatConfigs<any>()
      .then(configs => {
        if (!alive) return;
        const active = (configs || []).find((c: any) => c.is_active && !c.category_id);
        if (active) setVatRate(Number(active.rate));
      })
      .catch(() => {});
    Promise.all([
      freshflow.addresses<Address>(),
      freshflow.deliverySlots<Slot>(),
      freshflow.catalog<CatalogProduct>(),
    ]).then(([addressList, slotList, catalog]) => {
      if (!alive) return;
      setAddresses(addressList);
      setSlots(slotList.filter(slot => slot.is_active !== false));
      setAddressId(addressList.find(a => a.is_default)?.id || addressList[0]?.id || 0);
      try {
        allocateOrderItems(catalog, cart);
        setBatchError('');
      } catch (err) {
        setBatchError(message(err));
      }
      setLoaded(true);
    }).catch(err => { if (alive) setError(message(err)); });
    return () => { alive = false; };
  }, [cart]);

  return (
    <form
      className="panel mx-auto max-w-2xl space-y-5 p-6"
      onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        try {
          await done({
            delivery: pickup ? 'Điểm giao tập trung' : 'Giao riêng',
            addressId,
            deliverySlotId: slotId || null,
            note,
            paymentMethod,
            vatRate,
            vatAmount,
            totalWithVat: grandTotal,
          });
        } catch (err) {
          setError(message(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="border-b border-[#f0f4f1] pb-3">
        <h2 className="text-lg font-extrabold text-[#1f2d25]">Xác nhận & Thanh toán đơn hàng</h2>
        <p className="text-xs text-[#7d8f85]">Kiểm tra thuế VAT, hình thức giao và phương thức thanh toán</p>
      </div>

      {error && <p role="alert" className="text-xs text-rose-700 bg-rose-50 p-3 rounded-xl">{error}</p>}
      {batchError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Chưa thể gửi đơn: {batchError}</p>}

      {/* Delivery type */}
      <div>
        <label className="block text-xs font-bold text-[#3d5045] mb-1.5">Hình thức nhận hàng</label>
        <div className="grid grid-cols-2 gap-3">
          <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer text-xs ${pickup ? 'border-[#176b52] bg-[#f4f9f6]' : 'border-[#e8ece8]'}`}>
            <input type="radio" checked={pickup} onChange={() => setPickup(true)} />
            <div>
              <div className="font-bold text-[#1f2d25]">Điểm giao tập trung</div>
              <div className="text-[10px] text-emerald-700">Miễn phí giao hàng</div>
            </div>
          </label>

          <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer text-xs ${!pickup ? 'border-[#176b52] bg-[#f4f9f6]' : 'border-[#e8ece8]'}`}>
            <input type="radio" checked={!pickup} onChange={() => setPickup(false)} />
            <div>
              <div className="font-bold text-[#1f2d25]">Giao hàng tận nơi</div>
              <div className="text-[10px] text-[#7d8f85]">Shipper giao tận cửa ({money(20000)})</div>
            </div>
          </label>
        </div>
      </div>

      {/* Address selection if home delivery */}
      {!pickup && (
        <div className="space-y-2 rounded-xl bg-[#f9fbf9] p-4 border border-[#e8ede8]">
          <label className="block text-xs font-bold text-[#3d5045]">Địa chỉ giao hàng</label>
          <select
            className={field}
            required
            value={addressId || ''}
            onChange={event => setAddressId(Number(event.target.value))}
          >
            <option value="">Chọn địa chỉ giao...</option>
            {addresses.map(a => (
              <option key={a.id} value={a.id}>{a.label}: {addressText(a)} ({a.recipient})</option>
            ))}
          </select>
          <Link href="/profile" className="inline-block text-[11px] font-bold text-[#176b52] hover:underline">
            + Quản lý hoặc thêm địa chỉ mới
          </Link>
        </div>
      )}

      {/* Delivery slot selection */}
      {slots.length > 0 && (
        <div className="space-y-2 rounded-xl bg-[#f9fbf9] p-4 border border-[#e8ede8]">
          <label className="block text-xs font-bold text-[#3d5045]">Khung giờ giao hàng</label>
          <select
            className={field}
            value={slotId || ''}
            onChange={event => setSlotId(Number(event.target.value))}
          >
            <option value="">Chọn khung giờ (mặc định)...</option>
            {slots.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{s.start_time ? ` (${s.start_time} - ${s.end_time || ''})` : ''}{Number(s.fee) > 0 ? ` - Phí: ${money(Number(s.fee))}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Payment method */}
      <div>
        <label className="block text-xs font-bold text-[#3d5045] mb-1.5">Phương thức thanh toán</label>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[
            { id: 'COD', label: 'Tiền mặt khi nhận (COD)' },
            { id: 'BANK_TRANSFER', label: 'Chuyển khoản QR' },
            { id: 'WALLET', label: 'Ví điện tử' },
          ].map(pm => (
            <label
              key={pm.id}
              className={`flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer text-[11px] ${
                paymentMethod === pm.id ? 'border-[#176b52] bg-[#f4f9f6] font-bold text-[#176b52]' : 'border-[#e8ede8] text-[#55695f]'
              }`}
            >
              <input type="radio" checked={paymentMethod === pm.id} onChange={() => setPaymentMethod(pm.id)} />
              {pm.label}
            </label>
          ))}
        </div>
      </div>

      {/* Note */}
      <div>
        <label className="block text-xs font-bold text-[#3d5045] mb-1">Ghi chú cho Shipper & Shop</label>
        <textarea
          rows={2}
          className={field}
          placeholder="Chỉ dẫn đường đi, giờ giao hoặc yêu cầu sơ chế..."
          value={note}
          onChange={event => setNote(event.target.value)}
          maxLength={300}
        />
      </div>

      {/* Financial breakdown table */}
      <div className="rounded-2xl border border-[#e8ede8] bg-[#fafcfa] p-4 text-xs space-y-2">
        <div className="flex justify-between text-[#627369]">
          <span>Tổng tiền hàng (chưa thuế):</span>
          <span>{money(total)}</span>
        </div>
        <div className="flex justify-between text-[#627369]">
          <span>Thuế VAT ({Math.round(vatRate * 100)}% theo quy định):</span>
          <span className="font-semibold text-[#1f2d25]">{money(vatAmount)}</span>
        </div>
        <div className="flex justify-between text-[#627369]">
          <span>Phí giao hàng:</span>
          <span>{fee > 0 ? money(fee) : 'Miễn phí'}</span>
        </div>
        <div className="border-t border-[#e8ede8] pt-2 flex justify-between font-extrabold text-sm text-[#1f2d25]">
          <span>Tổng thanh toán:</span>
          <span className="text-base text-[#176b52]">{money(grandTotal)}</span>
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-[#176b52] py-3 text-xs font-bold text-white shadow-md hover:bg-[#125340] disabled:opacity-50"
        disabled={!loaded || busy || Boolean(batchError) || (!pickup && !addressId)}
      >
        {busy ? 'Đang gửi đơn hàng…' : 'Xác nhận đặt đơn ngay'}
      </button>
    </form>
  );
}
