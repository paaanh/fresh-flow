'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faClock, faPlus, faTrash, faTruck } from '@fortawesome/free-solid-svg-icons';
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
  const [activeTab, setActiveTab] = useState<'orders' | 'slots'>('orders');
  const [slots, setSlots] = useState<Array<{ id: number; name: string; customer_group: string; fee: number; is_active: boolean }>>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [showAddSlotModal, setShowAddSlotModal] = useState(false);
  const [newSlotName, setNewSlotName] = useState('');
  const [newSlotFee, setNewSlotFee] = useState('15000');
  const [newSlotGroup, setNewSlotGroup] = useState('ALL');
  const [addingSlot, setAddingSlot] = useState(false);

  const activeOrders = orders.filter(order => ['Đang chuẩn bị', 'Chờ Shipper lấy hàng', 'Đang giao'].includes(order.status));

  const fetchSlots = () => {
    setLoadingSlots(true);
    freshflow.deliverySlots<any>()
      .then(res => setSlots(res || []))
      .catch(() => {})
      .finally(() => setLoadingSlots(false));
  };

  useEffect(() => {
    fetchSlots();
  }, []);

  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlotName.trim()) return;
    setAddingSlot(true);
    try {
      await freshflow.createDeliverySlot({
        name: newSlotName.trim(),
        fee: Number(newSlotFee) || 0,
        customer_group: newSlotGroup as any,
        is_active: true,
      });
      setNewSlotName('');
      setNewSlotFee('15000');
      setShowAddSlotModal(false);
      fetchSlots();
    } catch (err) {
      alert('Không thể tạo khung giờ: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAddingSlot(false);
    }
  };

  const handleDeleteSlot = async (id: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa khung giờ này khỏi hệ thống?')) return;
    try {
      await freshflow.deleteDeliverySlot(id);
      fetchSlots();
    } catch (err) {
      alert('Không thể xóa khung giờ: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebe5] pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'orders'
                ? 'bg-[#176b52] text-white shadow-sm'
                : 'bg-white border border-[#d8e0d8] text-[#55665c] hover:bg-slate-50'
            }`}
          >
            <FontAwesomeIcon icon={faTruck} />
            Đơn hàng đang điều phối ({activeOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('slots')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'slots'
                ? 'bg-[#176b52] text-white shadow-sm'
                : 'bg-white border border-[#d8e0d8] text-[#55665c] hover:bg-slate-50'
            }`}
          >
            <FontAwesomeIcon icon={faClock} />
            Cấu hình khung giờ giao hàng ({slots.length})
          </button>
        </div>

        {activeTab === 'slots' && (
          <button
            onClick={() => setShowAddSlotModal(true)}
            className="flex items-center gap-2 rounded-xl bg-[#176b52] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#125843] transition"
          >
            <FontAwesomeIcon icon={faPlus} />
            Thêm khung giờ mới
          </button>
        )}
      </div>

      {/* Tab 1: Đơn hàng đang điều phối */}
      {activeTab === 'orders' && (
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
      )}

      {/* Tab 2: Cấu hình khung giờ giao hàng */}
      {activeTab === 'slots' && (
        <div className="space-y-4">
          <div className="panel p-5">
            <h3 className="text-sm font-bold text-[#1f2d25]">Danh sách Khung giờ & Thời điểm giao</h3>
            <p className="mt-1 text-xs text-[#7d8f85]">
              Các khung giờ này sẽ xuất hiện trên màn hình Thanh toán (Checkout) để khách hàng lựa chọn khi đặt hàng.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#e5ebe5] text-[#7d8f85]">
                    <th className="pb-3 font-semibold">Tên khung giờ / Điểm giao</th>
                    <th className="pb-3 font-semibold">Nhóm áp dụng</th>
                    <th className="pb-3 font-semibold">Phí giao hàng</th>
                    <th className="pb-3 font-semibold">Trạng thái</th>
                    <th className="pb-3 font-semibold text-right">Tác vụ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f4f0]">
                  {slots.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 font-bold text-[#1f2d25] flex items-center gap-2">
                        <FontAwesomeIcon icon={faClock} className="text-[#176b52]" />
                        {s.name}
                      </td>
                      <td className="py-3 text-slate-600">
                        {s.customer_group === 'ALL'
                          ? 'Tất cả khách hàng'
                          : s.customer_group === 'STUDENT'
                          ? 'Sinh viên'
                          : s.customer_group === 'WORKING'
                          ? 'Người đi làm'
                          : s.customer_group}
                      </td>
                      <td className="py-3 font-semibold text-[#176b52]">
                        {s.fee > 0 ? money(s.fee) : 'Miễn phí (0đ)'}
                      </td>
                      <td className="py-3">
                        <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          {s.is_active ? 'Đang kích hoạt' : 'Tạm tắt'}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDeleteSlot(s.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Xóa khung giờ"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {slots.length === 0 && !loadingSlots && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Chưa có khung giờ giao hàng nào. Bấm "+ Thêm khung giờ mới" để bắt đầu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Thêm khung giờ mới */}
      {showAddSlotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-[#1f2d25]">Thêm khung giờ giao hàng mới</h3>
              <button
                onClick={() => setShowAddSlotModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSlot} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#2d3d34] mb-1">Tên khung giờ / Điểm giao</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Giao sáng · 08:00 - 10:00 hoặc KTX Khu A · 11:30"
                  value={newSlotName}
                  onChange={e => setNewSlotName(e.target.value)}
                  className="w-full rounded-xl border border-[#d8e0d8] p-3 text-xs outline-none focus:border-[#176b52]"
                />
                <p className="mt-1 text-[11px] text-slate-400">Tên này sẽ hiển thị trực tiếp trong menu chọn của khách.</p>
              </div>

              <div>
                <label className="block font-bold text-[#2d3d34] mb-1">Phí giao hàng (VNĐ)</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  required
                  value={newSlotFee}
                  onChange={e => setNewSlotFee(e.target.value)}
                  className="w-full rounded-xl border border-[#d8e0d8] p-3 text-xs outline-none focus:border-[#176b52]"
                />
                <p className="mt-1 text-[11px] text-slate-400">Nhập 0đ nếu là điểm giao tập trung hoặc miễn phí giao.</p>
              </div>

              <div>
                <label className="block font-bold text-[#2d3d34] mb-1">Nhóm khách hàng áp dụng</label>
                <select
                  value={newSlotGroup}
                  onChange={e => setNewSlotGroup(e.target.value)}
                  className="w-full rounded-xl border border-[#d8e0d8] p-3 text-xs outline-none focus:border-[#176b52]"
                >
                  <option value="ALL">Tất cả khách hàng (ALL)</option>
                  <option value="STUDENT">Chỉ dành cho Sinh viên (STUDENT)</option>
                  <option value="WORKING">Chỉ dành cho Người đi làm (WORKING)</option>
                  <option value="GROUP_A">Nhóm A (GROUP_A)</option>
                  <option value="GROUP_B">Nhóm B (GROUP_B)</option>
                  <option value="COLLECTIVE">Khách hàng tập thể (COLLECTIVE)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddSlotModal(false)}
                  className="rounded-xl border border-[#d8e0d8] px-4 py-2 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={addingSlot}
                  className="rounded-xl bg-[#176b52] px-5 py-2 font-bold text-white shadow-sm hover:bg-[#125843] disabled:opacity-50"
                >
                  {addingSlot ? 'Đang lưu...' : 'Tạo khung giờ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

type ManagedUser = {
  id: number;
  initials: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  group: string;
  shop_name: string;
  vehicle_info: string;
  is_active: boolean;
  status: string;
  is_email_verified?: boolean;
  is_phone_verified?: boolean;
};

export function CustomersView({ notify, apiState }: { notify: (message: string) => void; apiState: string }) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [customers, setCustomers] = useState<ManagedUser[]>([]);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [saving, setSaving] = useState(false);

  const loadUsers = () => {
    if (apiState !== 'live') return;
    api.get<any>(endpoints.customers).then(result => {
      setCustomers(unwrapList<any>(result).map(item => ({
        id: Number(item.id),
        initials: (item.full_name || item.name || '?').slice(0, 2).toUpperCase(),
        name: item.full_name || item.name || '',
        email: item.email || '',
        phone: item.phone || '',
        role: String(item.role || 'CUSTOMER').toUpperCase(),
        group: item.customer_group?.name || item.customer_group || 'WORKING',
        shop_name: item.shop_name || '',
        vehicle_info: item.vehicle_info || '',
        is_active: Boolean(item.is_active),
        is_email_verified: Boolean(item.is_email_verified),
        is_phone_verified: Boolean(item.is_phone_verified),
        status: item.is_active ? 'Hoạt động' : 'Tạm khóa',
      })));
    }).catch(() => notify('Không tải được danh sách tài khoản.'));
  };

  useEffect(() => {
    loadUsers();
  }, [apiState]);

  const visible = customers.filter(customer => {
    const matchText = `${customer.name} ${customer.email} ${customer.phone} ${customer.shop_name}`.toLowerCase().includes(query.toLowerCase());
    const matchRole = roleFilter === 'ALL' || customer.role === roleFilter;
    return matchText && matchRole;
  });

  const toggle = async (customer: ManagedUser) => {
    const active = !customer.is_active;
    try {
      await freshflow.userStatus(customer.id, active);
      setCustomers(current => current.map(item => item.id === customer.id ? { ...item, is_active: active, status: active ? 'Hoạt động' : 'Tạm khóa' } : item));
      notify('Đã cập nhật trạng thái tài khoản.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không cập nhật được tài khoản.');
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await freshflow.adminUpdateUser(editing.id, {
        full_name: editing.name,
        phone: editing.phone || null,
        role: editing.role,
        customer_group: editing.group,
        is_active: editing.is_active,
        shop_name: editing.role === 'SHOP' ? editing.shop_name || null : null,
        vehicle_info: editing.role === 'SHIPPER' ? editing.vehicle_info || '' : '',
      });
      setCustomers(current => current.map(item => item.id === editing.id ? {
        ...item,
        name: updated.full_name,
        phone: updated.phone || '',
        role: String(updated.role).toUpperCase(),
        group: String(updated.customer_group),
        shop_name: updated.shop_name || '',
        vehicle_info: updated.vehicle_info || '',
        is_active: updated.is_active,
        status: updated.is_active ? 'Hoạt động' : 'Tạm khóa',
      } : item));
      setEditing(null);
      notify('Đã cập nhật chi tiết tài khoản thành công!');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể lưu thông tin tài khoản.');
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = (r: string) =>
    r === 'ADMIN' ? 'Quản trị viên' : r === 'SHOP' ? 'Cửa hàng (Shop)' : r === 'SHIPPER' ? 'Tài xế (Shipper)' : 'Khách hàng';

  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0f4f1] p-4">
          <div>
            <b className="text-sm text-[#1e2e26]">Quản lý Tài khoản, Vai trò & Nhóm khách hàng</b>
            <p className="mt-0.5 text-[11px] text-slate-400">Quản lý chi tiết thông tin tài khoản, phân quyền vai trò, nhóm áp dụng giá và trạng thái hoạt động.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'ALL', label: 'Tất cả' },
              { id: 'CUSTOMER', label: 'Khách hàng' },
              { id: 'SHOP', label: 'Cửa hàng (Shop)' },
              { id: 'SHIPPER', label: 'Shipper' },
              { id: 'ADMIN', label: 'Admin' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setRoleFilter(tab.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  roleFilter === tab.id ? 'bg-[#176b52] text-white' : 'bg-[#f4f7f4] text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Tìm tên, email, SĐT..."
              className="rounded-xl border border-[#d2ddd5] px-3 py-1.5 text-xs focus:outline-none"
            />
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead className="bg-[#f8faf8] text-[10px] uppercase text-slate-400">
              <tr>{['Tài khoản', 'Vai trò', 'Nhóm khách / Thông tin vai trò', 'Trạng thái', 'Hành động'].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {visible.map(customer => (
                <tr key={customer.id} className="border-t border-[#f0f4f1] hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-semibold text-[#1e2e26]">
                    {customer.name}
                    <div className="text-[10px] font-normal text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span>{customer.email}</span>
                      {customer.is_email_verified ? (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">Đã xác thực email</span>
                      ) : (
                        <span className="text-[9px] text-amber-700 bg-amber-50 px-1 rounded">Chưa xác thực email</span>
                      )}
                      {customer.phone && (
                        <>
                          <span>·</span>
                          <span>{customer.phone}</span>
                          {customer.is_phone_verified ? (
                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">Đã xác thực SĐT</span>
                          ) : (
                            <span className="text-[9px] text-amber-700 bg-amber-50 px-1 rounded">Chưa xác thực SĐT</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-5">
                    <Badge tone={customer.role === 'ADMIN' ? 'red' : customer.role === 'SHOP' ? 'green' : customer.role === 'SHIPPER' ? 'blue' : 'gray'}>
                      {roleLabel(customer.role)}
                    </Badge>
                  </td>
                  <td className="px-5">
                    {customer.role === 'CUSTOMER' ? (
                      <Badge tone={customer.group === 'STUDENT' || customer.group === 'Sinh viên' ? 'blue' : 'green'}>
                        Nhóm giá: {customer.group}
                      </Badge>
                    ) : customer.role === 'SHOP' ? (
                      <span className="text-xs font-semibold text-[#176b52]">{customer.shop_name || 'Đối tác Cửa hàng'}</span>
                    ) : customer.role === 'SHIPPER' ? (
                      <span className="text-xs font-semibold text-blue-700">{customer.vehicle_info || 'Tài xế vận chuyển'}</span>
                    ) : (
                      <span className="text-xs text-slate-400">Quản trị hệ thống</span>
                    )}
                  </td>
                  <td className="px-5">
                    <Badge tone={customer.is_active ? 'green' : 'red'}>{customer.status}</Badge>
                  </td>
                  <td className="px-5">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setEditing({ ...customer })}
                        className="font-bold text-[#176b52] hover:underline"
                      >
                        Chi tiết / Sửa
                      </button>
                      <button
                        onClick={() => void toggle(customer)}
                        className="font-bold text-rose-600 hover:underline"
                      >
                        {customer.is_active ? 'Khóa' : 'Mở khóa'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="p-8 text-center text-xs text-slate-400">Không có tài khoản phù hợp.</p>}
        </div>
      </div>

      {/* Modal Chỉnh sửa chi tiết tài khoản */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-[#1b2d24]">Chỉnh sửa chi tiết tài khoản</h3>
            <p className="mt-0.5 text-xs text-slate-500">Email: {editing.email} (ID #{editing.id})</p>

            <form onSubmit={handleSaveUser} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="font-bold text-slate-700">
                  Họ và tên *
                  <input
                    required
                    value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  />
                </label>
                <label className="font-bold text-slate-700">
                  Số điện thoại
                  <input
                    value={editing.phone}
                    onChange={e => setEditing({ ...editing, phone: e.target.value })}
                    placeholder="090..."
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  />
                </label>
                <label className="font-bold text-slate-700">
                  Vai trò hệ thống
                  <select
                    value={editing.role}
                    onChange={e => setEditing({ ...editing, role: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  >
                    <option value="CUSTOMER">Khách hàng (CUSTOMER)</option>
                    <option value="SHOP">Cửa hàng (SHOP)</option>
                    <option value="SHIPPER">Tài xế giao hàng (SHIPPER)</option>
                    <option value="ADMIN">Quản trị viên (ADMIN)</option>
                  </select>
                </label>
                <label className="font-bold text-slate-700">
                  Trạng thái hoạt động
                  <select
                    value={editing.is_active ? 'true' : 'false'}
                    onChange={e => setEditing({ ...editing, is_active: e.target.value === 'true' })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  >
                    <option value="true">Đang hoạt động</option>
                    <option value="false">Tạm khóa</option>
                  </select>
                </label>
              </div>

              {editing.role === 'CUSTOMER' && (
                <label className="block font-bold text-slate-700">
                  Nhóm khách hàng (Áp dụng chính sách giá)
                  <select
                    value={editing.group}
                    onChange={e => setEditing({ ...editing, group: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  >
                    <option value="STUDENT">Sinh viên (STUDENT)</option>
                    <option value="WORKING">Người đi làm (WORKING)</option>
                    <option value="GROUP_A">Nhóm A - Cư dân (GROUP_A)</option>
                    <option value="GROUP_B">Nhóm B - Hộ gia đình (GROUP_B)</option>
                    <option value="COLLECTIVE">Bếp ăn / Tập thể (COLLECTIVE)</option>
                  </select>
                </label>
              )}

              {editing.role === 'SHOP' && (
                <label className="block font-bold text-slate-700">
                  Tên Cửa hàng / Nông trại (Shop)
                  <input
                    value={editing.shop_name}
                    onChange={e => setEditing({ ...editing, shop_name: e.target.value })}
                    placeholder="Ví dụ: Nông Sản Sạch Đà Lạt Farm"
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  />
                </label>
              )}

              {editing.role === 'SHIPPER' && (
                <label className="block font-bold text-slate-700">
                  Thông tin phương tiện giao hàng
                  <input
                    value={editing.vehicle_info}
                    onChange={e => setEditing({ ...editing, vehicle_info: e.target.value })}
                    placeholder="Ví dụ: Xe máy Honda Wave - 59A1-123.45"
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  />
                </label>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#176b52] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#125340] disabled:opacity-50"
                >
                  {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
  const [terms, setTerms] = useState<{ id: number; term: string }[]>([]);
  const [violations, setViolations] = useState<{ id: number; user_id: number; source_type: string; content_excerpt: string; matched_terms: string; created_at: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const loadModeration = () => {
    freshflow.moderationTerms<{ id: number; term: string }>()
      .then(list => setTerms(list || []))
      .catch(() => {});
    freshflow.moderationViolations<any>()
      .then(list => setViolations(list || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadModeration();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    setBusy(true);
    try {
      const created = await freshflow.addModerationTerm<{ id: number; term: string }>(term.trim());
      setTerms(prev => [created, ...prev.filter(t => t.id !== created.id)]);
      setTerm('');
      notify('Đã thêm từ khóa kiểm duyệt nội dung.');
    } catch (err: any) {
      notify(err?.message || 'Không thêm được từ khóa.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await freshflow.deleteModerationTerm(id);
      setTerms(prev => prev.filter(t => t.id !== id));
      notify('Đã xóa từ khóa kiểm duyệt.');
    } catch (err: any) {
      notify(err?.message || 'Không thể xóa từ khóa.');
    }
  };

  const handleAddPreset = async () => {
    setBusy(true);
    try {
      for (const preset of ['lừa đảo', 'hàng giả', 'thối rữa', 'kém chất lượng', 'spam']) {
        await freshflow.addModerationTerm(preset);
      }
      loadModeration();
      notify('Đã nạp bộ từ khóa kiểm duyệt mẫu.');
    } catch (err: any) {
      notify(err?.message || 'Không thể nạp từ khóa mẫu.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="panel p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#1e2e26]">Kiểm duyệt nội dung tự động</h2>
            <p className="mt-1 text-xs text-slate-500">Chặn tự động các bài đăng Newfeed, yêu cầu mặt hàng, đánh giá hoặc tin nhắn chứa từ ngữ vi phạm quy định sàn.</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={handleAddPreset}
            className="rounded-xl border border-[#176b52] px-3.5 py-2 text-xs font-bold text-[#176b52] hover:bg-[#eef7f1] disabled:opacity-50"
          >
            + Nạp bộ từ khóa mẫu
          </button>
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
          <h3 className="text-xs font-bold text-slate-600 mb-3">Từ khóa đang bị chặn trên hệ thống ({terms.length})</h3>
          {terms.length === 0 ? (
            <p className="text-xs text-slate-400">Chưa có từ khóa nào trong cơ sở dữ liệu. Hãy nhấn &ldquo;+ Nạp bộ từ khóa mẫu&rdquo; hoặc thêm từ khóa ở trên.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {terms.map(t => (
                <span key={t.id} className="inline-flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700">
                  <span>{t.term}</span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(t.id)}
                    className="text-rose-400 hover:text-rose-800 font-bold"
                    title="Xóa từ khóa"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b border-[#f0f4f1] p-4">
          <h3 className="text-sm font-extrabold text-[#1e2e26]">Nhật ký vi phạm nội dung bị chặn ({violations.length})</h3>
          <p className="mt-0.5 text-[11px] text-slate-400">Ghi nhận các nội dung bị bộ lọc tự động từ chối trên toàn hệ thống.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-[#f8faf8] text-[10px] uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3">Thời gian</th>
                <th className="px-5 py-3">User ID</th>
                <th className="px-5 py-3">Nguồn nội dung</th>
                <th className="px-5 py-3">Từ khóa phát hiện</th>
                <th className="px-5 py-3">Trích đoạn nội dung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f4f1]">
              {violations.map(v => (
                <tr key={v.id}>
                  <td className="px-5 py-3 text-slate-500">{new Date(v.created_at).toLocaleString('vi-VN')}</td>
                  <td className="px-5 py-3 font-bold text-[#1e2e26]">#{v.user_id}</td>
                  <td className="px-5 py-3"><Badge tone="yellow">{v.source_type}</Badge></td>
                  <td className="px-5 py-3 font-bold text-rose-600">{v.matched_terms}</td>
                  <td className="px-5 py-3 text-slate-600">{v.content_excerpt}</td>
                </tr>
              ))}
              {violations.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-xs text-slate-400">
                    Hệ thống an toàn — Chưa ghi nhận nội dung vi phạm nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
  onNavigate,
  senderRole = 'ADMIN',
}: {
  notifications: { id: number; title: string; body: string; event_type: string; is_read: boolean; link?: string; created_at?: string }[];
  notify: (msg: string) => void;
  onReload?: () => void;
  markRead: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
  onNavigate?: (link: string) => void;
  senderRole?: 'ADMIN' | 'SHOP';
}) {
  const [activeTab, setActiveTab] = useState<'inbox' | 'create'>('inbox');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [targetRole, setTargetRole] = useState<'ALL' | 'CUSTOMER' | 'SHOP' | 'SHIPPER'>(senderRole === 'SHOP' ? 'CUSTOMER' : 'ALL');
  const [busy, setBusy] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const resolveNotificationLink = (item: { event_type: string; link?: string }) => {
    if (item.link) return item.link;
    if (item.event_type?.startsWith('order.')) return senderRole === 'SHOP' ? '/shop/orders' : '/orders';
    if (item.event_type?.startsWith('product_request.')) return '/requests';
    if (item.event_type?.startsWith('chat.')) return '/chat';
    return '/newfeed';
  };

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
        link: linkUrl.trim() || '/newfeed',
      } as any);
      const msg = res?.message || 'Đã gửi thông báo đến toàn bộ người dùng.';
      setSuccessMsg(msg);
      notify(msg);
      setTitle('');
      setBody('');
      setLinkUrl('');
      onReload?.();
    } catch (err: any) {
      notify(err?.message || 'Không thể gửi thông báo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Tách 2 Tab: Hộp thư thông báo nhận được & Tạo thông báo mới */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebe5] pb-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('inbox')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
              activeTab === 'inbox'
                ? 'bg-[#176b52] text-white shadow-sm'
                : 'border border-[#d8e0d8] bg-white text-[#55665c] hover:bg-slate-50'
            }`}
          >
            <span>Hộp thư thông báo nhận được ({notifications.length})</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
                {unreadCount} mới
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
              activeTab === 'create'
                ? 'bg-[#176b52] text-white shadow-sm'
                : 'border border-[#d8e0d8] bg-white text-[#55665c] hover:bg-slate-50'
            }`}
          >
            <FontAwesomeIcon icon={faPlus} />
            <span>{senderRole === 'SHOP' ? 'Tạo thông báo từ Cửa hàng' : 'Tạo & Phát thông báo mới'}</span>
          </button>
        </div>

        {activeTab === 'inbox' && notifications.length > 0 && (
          <button onClick={() => void clearAll()} className="text-xs font-bold text-[#176b52] hover:underline">
            Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      {/* Tab 2: Broadcast Form Panel */}
      {activeTab === 'create' && (
        <section className="panel p-6 space-y-5">
          <div className="border-b border-[#f0f4f1] pb-3">
            <h2 className="text-base font-extrabold text-[#1e2e26]">
              {senderRole === 'SHOP' ? 'Tạo thông báo từ Cửa hàng (Shop)' : 'Gửi thông báo toàn hệ thống'}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {senderRole === 'SHOP'
                ? 'Gửi thông báo ưu đãi nông sản mới, lịch thu hoạch hoặc thông tin đơn hàng đến khách hàng.'
                : 'Phát thông báo đẩy đến tất cả người dùng hoặc lọc theo vai trò (Khách hàng, Cửa hàng, Tài xế).'}
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

            <div className="grid gap-3 sm:grid-cols-2">
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
                <label className="block text-xs font-bold text-[#3d5045] mb-1">Trang điều hướng khi bấm vào</label>
                <select
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  className="w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                >
                  <option value="/newfeed">Bảng tin Newfeed (/newfeed)</option>
                  <option value="/products">Danh mục Sản phẩm (/products)</option>
                  <option value="/orders">Quản lý Đơn hàng (/orders)</option>
                  <option value="/requests">Yêu cầu Mặt hàng mới (/requests)</option>
                </select>
              </div>
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
      )}

      {/* Tab 1: Notifications List */}
      {activeTab === 'inbox' && (
        <section className="space-y-3">
          {notifications.length === 0 && (
            <div className="panel p-10 text-center text-sm text-slate-500">Chưa có thông báo nào trong hộp thư.</div>
          )}

          {notifications.map(item => {
            const targetHref = resolveNotificationLink(item);
            return (
              <article
                key={item.id}
                onClick={() => {
                  if (!item.is_read) void markRead(item.id);
                  if (onNavigate && targetHref) onNavigate(targetHref);
                }}
                className={`panel flex cursor-pointer items-start gap-3 p-4 transition hover:border-[#176b52]/40 hover:shadow-md ${
                  item.is_read ? 'opacity-75' : 'border-emerald-200 bg-emerald-50/40'
                }`}
              >
                <span className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${item.is_read ? 'bg-slate-300' : 'bg-emerald-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold text-[#1f2d25]">{item.title}</h4>
                    {item.event_type === 'system.broadcast' && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
                        Toàn sàn
                      </span>
                    )}
                    <span className="ml-auto text-[11px] font-semibold text-[#176b52] hover:underline">
                      Xem chi tiết →
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{item.body}</p>
                  <time className="mt-2 block text-[10px] text-slate-400">
                    {item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : item.event_type}
                  </time>
                </div>
                {!item.is_read && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      void markRead(item.id);
                    }}
                    className="text-xs font-semibold text-[#176b52] hover:underline shrink-0"
                  >
                    Đã đọc
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
