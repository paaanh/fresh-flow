'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBox,
  faBoxesStacked,
  faCheck,
  faClipboardList,
  faCommentDots,
  faEdit,
  faFolderTree,
  faMagnifyingGlass,
  faMotorcycle,
  faTriangleExclamation,
  faTrash,
  faPlus,
  faReply,
  faShoppingBag,
  faStar,
  faStore,
  faTruck,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import type { CustomerGroup, Order, Product, ProductReview, User } from '@/types/domain';
import ProductPhoto from '@/components/product-photo';
import UserAvatar from '@/components/user-avatar';
import StockShortageDialog from '@/components/stock-shortage-dialog';
import { freshflow } from '@/lib/api';
import { normalizeSearch } from '@/lib/search';
import { toDate } from '@/lib/dates';
import { getOrderVisualMeta, sortOrdersByPriority, getProductPricing } from '@/features/customer/page-model';

interface ShopPortalViewProps {
  currentUser: User;
  products: Product[];
  orders: Order[];
  reviews: ProductReview[];
  shippers: User[];
  customerGroups?: CustomerGroup[];
  onAddProduct: () => void;
  onAddCategory?: () => void;
  onBulk?: () => void;
  onEditProduct: (product: Product) => void;
  /** Stop selling a product (it disappears from the shop; past orders keep it). */
  onDeleteProduct?: (productId: number) => Promise<void> | void;
  onUpdateOrderStatus: (orderId: string, status: string, note?: string) => Promise<boolean>;
  onAssignShipper: (orderApiId: number, shipperId: number) => Promise<void>;
  onReplyReview: (reviewId: number, reply: string) => Promise<void>;
  onAdjustInventory: (productId: number, delta: number) => Promise<boolean>;
  onCreateCustomerGroup?: (data: { code: string; name: string; description?: string; discount_percent?: number }) => Promise<CustomerGroup | undefined>;
  onNotify?: (message: string) => void;
  initialTab?: 'overview' | 'products' | 'orders' | 'reviews' | 'groups';
  money: (n: number) => string;
  /** Product requests still waiting for a quote. */
  pendingRequests?: number;
}

/** At or below this many units a product is flagged "Sắp hết". */
const LOW_STOCK = 10;
const DONE = ['Hoàn thành', 'COMPLETED'];
const CANCELLED = ['Đã hủy', 'CANCELLED', 'Từ chối', 'REJECTED'];
const TO_PREPARE = ['Chờ xác nhận', 'Chờ duyệt', 'PENDING', 'Đã xác nhận', 'CONFIRMED', 'APPROVED', 'Đang chuẩn bị', 'PREPARING'];

export default function ShopPortalView({
  currentUser,
  products,
  orders,
  reviews,
  shippers,
  customerGroups = [],
  onAddProduct,
  onAddCategory,
  onBulk,
  onEditProduct,
  onDeleteProduct,
  onUpdateOrderStatus,
  onAssignShipper,
  onReplyReview,
  onAdjustInventory,
  onCreateCustomerGroup,
  onNotify,
  initialTab = 'overview',
  money,
  pendingRequests = 0,
}: ShopPortalViewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'reviews' | 'groups'>(initialTab);
  // Work first: the list opens on orders that still need doing
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('ACTIVE');
  const [orderSearch, setOrderSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productFilter, setProductFilter] = useState<string>('ALL');
  const [stockEdit, setStockEdit] = useState<{ id: number; value: string } | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  /** Product waiting for "Xóa sản phẩm?" confirmation. */
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const groupName = (code?: string | null) => (code ? customerGroups.find(g => g.code === code)?.name || code : '');
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [assigningOrderId, setAssigningOrderId] = useState<number | null>(null);
  const [selectedShipperId, setSelectedShipperId] = useState<number>(shippers[0]?.id || 0);

  // Customer group & member management state for Shop
  const [customers, setCustomers] = useState<User[]>([]);
  const [custSearch, setCustSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [custGroupFilter, setCustGroupFilter] = useState<string>('ALL');
  const [verifyFilter, setVerifyFilter] = useState<'ALL' | 'AVATAR' | 'OTP'>('ALL');
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<number[]>([]);
  const [targetGroupCode, setTargetGroupCode] = useState<string>(customerGroups[0]?.code || 'STUDENT');
  const [newGroupForm, setNewGroupForm] = useState({ name: '', code: '', discount_percent: 10, description: '' });
  const [groupBusy, setGroupBusy] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupPanel, setGroupPanel] = useState<'members' | 'add'>('members');
  const [stockOrder, setStockOrder] = useState<Order | null>(null);

  const loadShopCustomers = () => {
    freshflow
      .shopCustomers(custSearch.trim() || undefined)
      .then(list => setCustomers((list || []) as any))
      .catch(() => {});
  };

  useEffect(() => {
    if (activeTab === 'groups') loadShopCustomers();
  }, [activeTab]);

  useEffect(() => {
    setSelectedCandidateIds([]);
  }, [targetGroupCode]);

  useEffect(() => {
    if (customerGroups.length && !customerGroups.some(g => g.code === targetGroupCode)) {
      setTargetGroupCode(customerGroups[0].code);
    }
  }, [customerGroups, targetGroupCode]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupForm.name.trim()) return;
    setGroupBusy(true);
    try {
      const cleanCode = (
        newGroupForm.code.trim() ||
        newGroupForm.name
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .replace(/^_|_$/g, '')
      ).toUpperCase();
      if (onCreateCustomerGroup) {
        const created = await onCreateCustomerGroup({
          code: cleanCode || `GRP_${Date.now().toString().slice(-4)}`,
          name: newGroupForm.name.trim(),
          description: newGroupForm.description.trim(),
          discount_percent: Number(newGroupForm.discount_percent) || 0,
        });
        if (created) setTargetGroupCode(created.code);
      } else {
        const created = await freshflow.createCustomerGroup<CustomerGroup>({
          code: cleanCode,
          name: newGroupForm.name.trim(),
          description: newGroupForm.description.trim(),
          discount_percent: Number(newGroupForm.discount_percent) || 0,
        });
        setTargetGroupCode(created.code);
      }
      setNewGroupForm({ name: '', code: '', discount_percent: 10, description: '' });
    } finally {
      setGroupBusy(false);
    }
  };

  const handleAssignToGroup = async (customer: User, groupCode: string) => {
    setGroupBusy(true);
    try {
      const updated = await freshflow.assignCustomerGroup(customer.id, groupCode);
      setCustomers(prev => prev.map(item => (item.id === customer.id ? { ...item, customer_group: updated.customer_group } : item)));
      setSelectedCandidateIds(prev => prev.filter(id => id !== customer.id));
      onNotify?.(`Đã chuyển ${customer.full_name} sang nhóm ${groupCode}.`);
    } catch (err: any) {
      onNotify?.(err?.message || 'Không thể cập nhật nhóm khách hàng.');
    } finally {
      setGroupBusy(false);
    }
  };

  const handleBatchAssignSelected = async () => {
    const targets = customers.filter(c => selectedCandidateIds.includes(c.id) && c.customer_group !== targetGroupCode);
    if (targets.length === 0) return;
    setGroupBusy(true);
    try {
      const updatedRows = await Promise.all(
        targets.map(async cust => {
          const updated = await freshflow.assignCustomerGroup(cust.id, targetGroupCode);
          return { id: cust.id, customer_group: updated.customer_group };
        })
      );
      const mapUpdated = new Map(updatedRows.map(row => [row.id, row.customer_group]));
      setCustomers(prev =>
        prev.map(item => (mapUpdated.has(item.id) ? { ...item, customer_group: mapUpdated.get(item.id)! } : item))
      );
      setSelectedCandidateIds([]);
      onNotify?.(`Đã thêm ${targets.length} khách hàng vào nhóm ${targetGroupCode}.`);
    } catch (err: any) {
      onNotify?.(err?.message || 'Không thể thêm hàng loạt vào nhóm.');
    } finally {
      setGroupBusy(false);
    }
  };
  useEffect(() => setActiveTab(initialTab), [initialTab]);
  useEffect(() => {
    if (shippers.length && !shippers.some(shipper => shipper.id === selectedShipperId)) setSelectedShipperId(shippers[0].id);
  }, [shippers, selectedShipperId]);

  // Shop filtered data (Strict isolation per shop)
  const shopProducts = products.filter(p => p.shop_id === currentUser.id);
  const shopOrders = sortOrdersByPriority(orders.filter(o => o.shop_id === currentUser.id));
  const completedOrders = shopOrders.filter(o => DONE.includes(o.status));
  const totalShopRevenue = completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const activeOrders = shopOrders.filter(o => !DONE.includes(o.status) && !CANCELLED.includes(o.status));
  const toPrepare = shopOrders.filter(o => TO_PREPARE.includes(o.status));
  const today = new Date().toDateString();
  const todayOrders = shopOrders.filter(o => !CANCELLED.includes(o.status) && toDate(o.createdAt)?.toDateString() === today);
  const todaySales = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const lowStock = shopProducts.filter(p => p.available <= LOW_STOCK).sort((a, b) => a.available - b.available);
  const productCategories = Array.from(new Set(shopProducts.map(p => p.category).filter(Boolean)));
  const shownProducts = useMemo(() => {
    const q = normalizeSearch(productSearch.trim());
    return shopProducts.filter(p => {
      if (productFilter === 'LOW' && (p.available > LOW_STOCK || p.available <= 0)) return false;
      if (productFilter === 'OUT' && p.available > 0) return false;
      if (!['ALL', 'LOW', 'OUT'].includes(productFilter) && p.category !== productFilter) return false;
      return !q || normalizeSearch(`${p.name} ${p.category}`).includes(q);
    });
  }, [shopProducts, productSearch, productFilter]);

  /** Set the stock to an exact number (the difference is added as a batch or removed). */
  const saveStock = async (product: Product) => {
    if (!stockEdit) return;
    const target = Number(stockEdit.value.replace(',', '.'));
    if (!Number.isFinite(target) || target < 0) {
      onNotify?.('Số lượng tồn kho không hợp lệ.');
      return;
    }
    const delta = Math.round((target - product.available) * 1000) / 1000;
    if (delta === 0) {
      setStockEdit(null);
      return;
    }
    setStockBusy(true);
    try {
      if (await onAdjustInventory(product.id, delta)) setStockEdit(null);
    } finally {
      setStockBusy(false);
    }
  };

  const handleReplySubmit = async (reviewId: number) => {
    const text = replyText[reviewId]?.trim();
    if (!text) return;
    await onReplyReview(reviewId, text);
    setReplyText(prev => ({ ...prev, [reviewId]: '' }));
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningOrderId || !selectedShipperId) return;
    await onAssignShipper(assigningOrderId, selectedShipperId);
    setAssigningOrderId(null);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tab Content: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Every number leads to where the work is */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
            {[
              { href: '/shop/orders', label: 'Đơn cần chuẩn bị', value: String(toPrepare.length), hint: toPrepare.length ? 'Bấm để xử lý ngay' : 'Đã xử lý hết', tone: toPrepare.length ? 'text-amber-600' : 'text-[#176b52]', ring: toPrepare.length ? 'border-amber-200 bg-amber-50/40' : '' },
              { href: '/shop/orders', label: 'Doanh số hôm nay', value: money(todaySales), hint: `${todayOrders.length} đơn hôm nay`, tone: 'text-[#176b52]', ring: '' },
              { href: '/shop/products', label: 'Mặt hàng sắp hết', value: String(lowStock.length), hint: `trên ${shopProducts.length} mặt hàng`, tone: lowStock.length ? 'text-rose-600' : 'text-[#1f2d25]', ring: lowStock.length ? 'border-rose-200 bg-rose-50/40' : '' },
              { href: '/requests', label: 'Yêu cầu chờ báo giá', value: String(pendingRequests), hint: pendingRequests ? 'Khách đang chờ phản hồi' : 'Không có yêu cầu mới', tone: pendingRequests ? 'text-indigo-600' : 'text-[#1f2d25]', ring: pendingRequests ? 'border-indigo-200 bg-indigo-50/40' : '' },
            ].map(card => (
              <Link
                key={card.label}
                href={card.href}
                onClick={() => { if (card.href === '/shop/products' && lowStock.length) setProductFilter('LOW'); }}
                className={`group rounded-2xl border border-[#e8ede8] bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${card.ring}`}
              >
                <div className="text-[11px] font-semibold text-[#6f8077]">{card.label}</div>
                <div className={`mt-1.5 truncate text-lg font-extrabold sm:text-xl ${card.tone}`}>{card.value}</div>
                <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px] text-slate-400">
                  <span className="truncate">{card.hint}</span>
                  <span aria-hidden className="text-[#176b52] opacity-0 transition group-hover:opacity-100">→</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Orders that need the shop now */}
            <section className="rounded-2xl border border-[#e8ede8] bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1e2d25]">Đơn cần xử lý</h3>
                <Link href="/shop/orders" className="rounded-lg px-2 py-1.5 text-xs font-bold text-[#176b52] hover:bg-emerald-50">Tất cả đơn →</Link>
              </div>
              {activeOrders.slice(0, 5).map(order => (
                <Link key={order.id} href={`/orders/${encodeURIComponent(order.id)}`} className="flex items-center justify-between gap-3 border-t py-2.5 text-xs first:border-0 hover:bg-[#fafcfa]">
                  <span className="min-w-0">
                    <b className="block truncate text-[#176b52]">#{order.id}</b>
                    <span className="block truncate text-[11px] text-slate-500">{order.customer} · {order.items}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block rounded-full border px-2 py-0.5 text-[10px] font-bold ${getOrderVisualMeta(order.status).badge}`}>{order.status}</span>
                    <b className="mt-0.5 block text-[11px] text-[#1f2d25]">{money(order.total)}</b>
                  </span>
                </Link>
              ))}
              {activeOrders.length === 0 && <p className="py-4 text-center text-xs text-slate-500">Không có đơn nào đang chờ. 🎉</p>}
            </section>

            {/* Stock running out */}
            <section className="rounded-2xl border border-[#e8ede8] bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#1e2d25]">
                  {lowStock.length > 0 && <FontAwesomeIcon icon={faTriangleExclamation} className="text-rose-500" />} Hàng sắp hết
                </h3>
                <Link href="/shop/products" onClick={() => setProductFilter('LOW')} className="rounded-lg px-2 py-1.5 text-xs font-bold text-[#176b52] hover:bg-emerald-50">Nhập kho →</Link>
              </div>
              {lowStock.slice(0, 5).map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-t py-2.5 text-xs first:border-0">
                  <span className="min-w-0 truncate font-semibold text-[#1f2d25]">{p.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${p.available <= 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                    {p.available <= 0 ? 'Hết hàng' : `Còn ${p.available} ${p.unit}`}
                  </span>
                </div>
              ))}
              {lowStock.length === 0 && <p className="py-4 text-center text-xs text-slate-500">Tất cả mặt hàng còn trên {LOW_STOCK} đơn vị.</p>}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <div className="rounded-2xl border border-[#e8ede8] bg-white p-4 shadow-sm sm:p-5">
              <div className="text-[11px] font-semibold text-[#6f8077]">Doanh thu đã nhận (đơn hoàn thành)</div>
              <div className="mt-1.5 text-xl font-extrabold text-[#176b52]">{money(totalShopRevenue)}</div>
              <div className="mt-3 text-[11px] font-semibold text-[#6f8077]">Đánh giá trung bình</div>
              <div className="mt-1 text-base font-extrabold text-amber-500">
                {reviews.length > 0 ? `${(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)} ★ · ${reviews.length} lượt` : <span className="text-xs font-semibold text-slate-400">Chưa có đánh giá</span>}
              </div>
            </div>
            <div className="rounded-2xl border border-[#e8ede8] bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-[#1e2d25]">Đánh giá mới nhất</h3><Link href="/shop/reviews" className="rounded-lg px-2 py-1.5 text-xs font-bold text-[#176b52] hover:bg-emerald-50">Xem tất cả</Link></div>
              {reviews.slice(0, 3).map(review => <article key={review.id} className="border-t py-3 first:border-0"><div className="flex items-center justify-between text-xs"><b>{review.user_name || 'Khách hàng'}</b><span className="text-amber-500">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div><p className="mt-1 text-xs text-slate-600">{review.comment || 'Khách hàng đã gửi đánh giá.'}</p></article>)}
              {reviews.length === 0 && <p className="text-xs text-slate-500">Chưa có đánh giá mới. Đánh giá của khách sẽ được đồng bộ tại đây.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: PRODUCTS */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#1e2d25]">Danh sách sản phẩm của Shop <span className="font-semibold text-slate-400">({shownProducts.length}/{shopProducts.length})</span></h3>
            <div className="flex gap-2">
              {onAddCategory && (
                <button onClick={onAddCategory} className="flex items-center gap-1.5 rounded-xl border border-[#d2ddd5] bg-white px-3 py-2 text-xs font-bold text-[#176b52] hover:bg-emerald-50">
                  <FontAwesomeIcon icon={faFolderTree} /> Danh mục
                </button>
              )}
              {onBulk && (
                <button onClick={onBulk} className="flex items-center gap-1.5 rounded-xl border border-[#d2ddd5] bg-white px-3 py-2 text-xs font-bold text-[#176b52] hover:bg-emerald-50">
                  <FontAwesomeIcon icon={faBoxesStacked} /> Thêm nhiều mặt hàng
                </button>
              )}
              <button onClick={onAddProduct} className="flex items-center gap-1.5 rounded-xl bg-[#176b52] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#125340]">
                <FontAwesomeIcon icon={faPlus} /> Thêm sản phẩm
              </button>
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="relative block">
              <span className="sr-only">Tìm sản phẩm</span>
              <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400" />
              <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Tìm sản phẩm của Shop…" className="w-full rounded-xl border border-[#dfe7e1] bg-white py-2.5 pl-8 pr-3 text-xs focus:border-[#176b52] focus:outline-none" />
            </label>
            <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Lọc sản phẩm">
              {[
                { id: 'ALL', label: 'Tất cả' },
                { id: 'OUT', label: `Hết hàng (${shopProducts.filter(p => p.available <= 0).length})` },
                { id: 'LOW', label: `Sắp hết (${lowStock.filter(p => p.available > 0).length})` },
                ...productCategories.map(c => ({ id: c, label: c })),
              ].map(f => (
                <button key={f.id} type="button" role="tab" aria-selected={productFilter === f.id} onClick={() => setProductFilter(f.id)} className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition ${productFilter === f.id ? (f.id === 'LOW' ? 'bg-amber-500 text-white' : f.id === 'OUT' ? 'bg-slate-700 text-white' : 'bg-[#176b52] text-white') : 'border border-[#dce4de] bg-white text-[#526359] hover:bg-slate-50'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2 columns on phones, 3 on larger screens */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3">
            {shownProducts.map(product => {
              const pricing = getProductPricing(product);
              return (
              <div
                key={product.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e8ede8] bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 sm:aspect-video">
                  <ProductPhoto product={product} className={`h-full w-full object-cover ${product.available <= 0 ? 'opacity-50 grayscale' : ''}`} />
                  {product.available <= 0 && (
                    <span className="absolute inset-x-0 bottom-0 bg-slate-900/70 py-1 text-center text-[11px] font-extrabold uppercase tracking-wide text-white">Hết hàng</span>
                  )}
                  {product.available > 0 && product.available <= LOW_STOCK && (
                    <span className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold shadow sm:right-2 sm:top-2 ${product.available <= 0 ? 'bg-slate-800 text-white' : 'bg-amber-400 text-amber-950'}`}>
                      {product.available <= 0 ? 'Hết hàng' : 'Sắp hết'}
                    </span>
                  )}
                  {pricing.isSale && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow sm:left-2 sm:top-2 sm:px-2 sm:text-[10px]">
                      SALE -{pricing.discountPercent}%
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-2.5 sm:p-4">
                  <div className="min-w-0">
                    <h4 className="line-clamp-2 break-words text-xs font-bold text-[#1f2d25] sm:text-sm">{product.name}</h4>
                    <span className="block truncate text-[10px] text-[#7d8f85]">{product.category} · {product.unit}</span>
                  </div>
                  <div className="mt-1 flex flex-col">
                    {pricing.isSale && <span className="text-[10px] leading-tight text-slate-400 line-through">{money(pricing.originalPrice)}</span>}
                    <span className={`text-sm font-extrabold leading-tight ${pricing.isSale ? 'text-rose-600' : 'text-[#176b52]'}`}>{money(pricing.effectivePrice)}</span>
                  </div>

                  <div className="mt-auto flex flex-col gap-2 border-t border-[#f0f4f1] pt-2 text-xs text-[#526359] sm:mt-3 sm:flex-row sm:items-center sm:justify-between">
                    {stockEdit?.id === product.id ? (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={e => { e.preventDefault(); void saveStock(product); }}
                      >
                        <label className="sr-only" htmlFor={`stock-${product.id}`}>Tồn kho mới của {product.name}</label>
                        <input
                          id={`stock-${product.id}`}
                          autoFocus
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={stockEdit.value}
                          onChange={e => setStockEdit({ id: product.id, value: e.target.value })}
                          onKeyDown={e => { if (e.key === 'Escape') setStockEdit(null); }}
                          className="h-8 w-full min-w-0 rounded-lg border border-[#176b52] px-2 text-xs font-bold focus:outline-none"
                        />
                        <button type="submit" disabled={stockBusy} aria-label="Lưu tồn kho" className="h-8 shrink-0 rounded-lg bg-[#176b52] px-2 text-[11px] font-bold text-white disabled:opacity-50">Lưu</button>
                        <button type="button" onClick={() => setStockEdit(null)} aria-label="Hủy sửa tồn kho" className="h-8 shrink-0 rounded-lg border px-2 text-[11px]">✕</button>
                      </form>
                    ) : (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setStockEdit({ id: product.id, value: String(product.available) })}
                          title="Bấm để nhập số tồn kho"
                          className={`whitespace-nowrap rounded-lg border border-dashed px-1.5 py-1 hover:border-[#176b52] ${product.available <= LOW_STOCK ? 'border-rose-300 text-rose-700' : 'border-[#cfd9d2]'}`}
                        >
                          Tồn: <b>{product.available}</b> {product.unit} <FontAwesomeIcon icon={faEdit} className="ml-0.5 text-[9px] opacity-60" />
                        </button>
                        <span className="flex gap-1">
                          <button aria-label={`Giảm tồn kho ${product.name}`} onClick={() => void onAdjustInventory(product.id, -1)} className="h-7 w-7 rounded-lg border">−</button>
                          <button aria-label={`Tăng tồn kho ${product.name}`} onClick={() => void onAdjustInventory(product.id, 1)} className="h-7 w-7 rounded-lg border">+</button>
                        </span>
                      </span>
                    )}
                    <span className="flex gap-1.5">
                      <button
                        onClick={() => onEditProduct(product)}
                        className="flex-1 rounded-lg border border-[#d6e7dc] py-1.5 text-xs font-bold text-[#176b52] hover:bg-emerald-50 sm:border-0 sm:px-1 sm:py-0 sm:hover:bg-transparent sm:hover:underline"
                      >
                        <FontAwesomeIcon icon={faEdit} className="mr-1" />
                        <span className="sm:hidden">Sửa</span>
                        <span className="hidden sm:inline">Chỉnh sửa</span>
                      </button>
                      {onDeleteProduct && (
                        <button
                          onClick={() => setDeleting(product)}
                          aria-label={`Xóa ${product.name}`}
                          title="Xóa sản phẩm"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 sm:h-7 sm:w-7 sm:border-0"
                        >
                          <FontAwesomeIcon icon={faTrash} className="text-[11px]" />
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              );
            })}
            {shopProducts.length === 0 && <div className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">Shop chưa có mặt hàng. Hãy thêm mặt hàng đầu tiên.</div>}
            {shopProducts.length > 0 && shownProducts.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed p-8 text-center text-xs text-slate-500">
                Không có sản phẩm phù hợp.{' '}
                <button type="button" onClick={() => { setProductSearch(''); setProductFilter('ALL'); }} className="font-bold text-[#176b52] underline">Xem tất cả</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#1e2d25]">Quản lý & Lịch sử Đơn hàng tại Shop</h3>
              <p className="text-[11px] text-[#7d8f85]">Xác nhận đơn, đóng gói, bàn giao Điểm giao tập trung hoặc điều phối Shipper.</p>
            </div>
            <div className="-mx-3 flex w-[calc(100%+1.5rem)] gap-1.5 overflow-x-auto px-3 pb-1 scrollbar-hide sm:mx-0 sm:w-auto sm:flex-wrap sm:px-0" role="tablist" aria-label="Lọc đơn hàng">
              {[
                { id: 'ACTIVE', label: `Cần xử lý (${activeOrders.length})` },
                { id: 'ALL', label: `Tất cả (${shopOrders.length})` },
                { id: 'COMPLETED', label: `Đã hoàn thành (${completedOrders.length})` },
                { id: 'CANCELLED', label: `Đã hủy (${shopOrders.filter(o => ['Đã hủy', 'CANCELLED'].includes(o.status)).length})` },
              ].map(f => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={orderStatusFilter === f.id}
                  onClick={() => setOrderStatusFilter(f.id as any)}
                  className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    orderStatusFilter === f.id
                      ? 'bg-[#176b52] text-white shadow-sm'
                      : 'bg-white border border-[#dce4de] text-[#526359] hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <label className="relative block">
            <span className="sr-only">Tìm đơn hàng</span>
            <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400" />
            <input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Tìm mã đơn, tên khách, SĐT, mặt hàng…" className="w-full rounded-xl border border-[#dfe7e1] bg-white py-2.5 pl-8 pr-3 text-xs focus:border-[#176b52] focus:outline-none" />
          </label>

          <div className="space-y-3">
            {(() => {
              const q = normalizeSearch(orderSearch.trim());
              const list = shopOrders.filter(o => {
                if (orderStatusFilter === 'ACTIVE' && (DONE.includes(o.status) || CANCELLED.includes(o.status))) return false;
                if (orderStatusFilter === 'COMPLETED' && !DONE.includes(o.status)) return false;
                if (orderStatusFilter === 'CANCELLED' && !CANCELLED.includes(o.status)) return false;
                if (!q) return true;
                const hay = `${o.id} ${o.customer} ${o.recipient_phone || ''} ${o.items} ${(o.lines || []).map(l => l.name).join(' ')}`;
                return normalizeSearch(hay).includes(q);
              });
              if (shopOrders.length > 0 && list.length === 0) {
                return (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-xs text-slate-500">
                    {q ? 'Không tìm thấy đơn phù hợp.' : orderStatusFilter === 'ACTIVE' ? 'Không còn đơn nào cần xử lý. 🎉' : 'Chưa có đơn trong mục này.'}
                  </div>
                );
              }
              return list.map(order => {
                const isCentral = order.delivery === 'Điểm giao tập trung';
                const canCancel = !['Hoàn thành', 'COMPLETED', 'Đã hủy', 'CANCELLED', 'Từ chối', 'REJECTED', 'Đang giao', 'DELIVERING'].includes(order.status);
                const visual = getOrderVisualMeta(order.status);
                // Finished orders: one compact row — the details are one tap away
                if (DONE.includes(order.status) || CANCELLED.includes(order.status)) {
                  return (
                    <Link
                      key={order.id}
                      href={`/orders/${encodeURIComponent(order.id)}`}
                      className={`flex items-center justify-between gap-3 rounded-2xl border border-[#e8ede8] border-l-4 px-4 py-3 text-xs shadow-sm transition hover:shadow-md ${visual.border} ${visual.muted ? 'bg-slate-50' : 'bg-white'}`}
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <b className={visual.muted ? 'text-slate-500 line-through' : 'text-[#176b52]'}>#{order.id}</b>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${visual.badge}`}>{order.status}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{order.customer} · {order.items} · {order.date}</span>
                      </span>
                      <b className={`shrink-0 ${visual.muted ? 'text-slate-400' : 'text-[#1f2d25]'}`}>{money(order.total)}</b>
                    </Link>
                  );
                }
                return (
                  <div
                    key={order.id}
                    className={`flex flex-col justify-between rounded-2xl border border-[#e8ede8] border-l-4 p-4 shadow-sm md:flex-row md:items-center gap-4 transition ${visual.border} ${
                      visual.muted ? 'bg-slate-100/80 opacity-75' : 'bg-white hover:shadow-md'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/orders/${encodeURIComponent(order.id)}`}
                          className={`font-extrabold hover:underline ${
                            visual.muted ? 'line-through text-slate-500' : 'text-[#176b52]'
                          }`}
                        >
                          #{order.id}
                        </Link>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${visual.badge}`}>
                          {order.status}
                        </span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${isCentral ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-blue-50 text-blue-700'}`}>
                          {order.delivery}
                        </span>
                        <span className="text-[11px] text-slate-400">{order.date}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#627369]">
                        <UserAvatar
                          name={order.customer}
                          avatarUrl={order.customer_avatar_url}
                          size="xs"
                          verified={Boolean(order.customer_avatar_url)}
                        />
                        <span>
                          Khách hàng: <b>{order.customer}</b>
                        </span>
                        {order.customer_group && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            {groupName(order.customer_group)}
                          </span>
                        )}
                        <span>
                          · Mặt hàng: <b>{order.items}</b> · Tổng tiền: <b className={visual.muted ? 'text-slate-500' : 'text-[#176b52]'}>{money(order.total)}</b>
                        </span>
                      </div>
                      {order.shipper_name && (
                        <div className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                          <FontAwesomeIcon icon={faMotorcycle} className="text-[10px]" />
                          <span>Shipper nhận đơn: <b>{order.shipper_name}</b></span>
                          {order.shipper_phone && <span>· SĐT: <b>{order.shipper_phone}</b></span>}
                          {order.shipper_vehicle && <span>· Xe: {order.shipper_vehicle}</span>}
                        </div>
                      )}
                      {order.lines && order.lines.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {order.lines.map((line, idx) => (
                            <span key={idx} className="rounded-lg bg-[#f7faf8] border border-[#e6ede8] px-2 py-0.5 text-[11px] text-[#3a4d42]">
                              {line.name} × <b>{line.quantity}</b> {line.unit}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="text-[11px] text-[#86968d]">
                        {isCentral ? 'Nhận tại Điểm giao tập trung' : `Giao tới: ${order.delivery_address || order.delivery}`}
                        {order.note ? ` · Ghi chú: ${order.note}` : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/orders/${encodeURIComponent(order.id)}`}
                        className="rounded-xl border border-[#d2ddd5] bg-white px-3 py-2 text-xs font-bold text-[#33493d] hover:bg-slate-50"
                      >
                        Chi tiết & Lịch sử
                      </Link>

                      {['Chờ xác nhận', 'Chờ duyệt', 'PENDING'].includes(order.status) && (
                        <>
                          <button
                            onClick={() => setStockOrder(order)}
                            className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                          >
                            Kiểm tra kho
                          </button>
                          <button
                            onClick={async () => {
                              const ok = await onUpdateOrderStatus(order.id, 'Đã xác nhận', 'Shop đã xác nhận đơn hàng');
                              if (!ok) setStockOrder(order);
                            }}
                            className="rounded-xl bg-[#176b52] px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-[#125340]"
                          >
                            Xác nhận đơn
                          </button>
                        </>
                      )}

                      {['Đã xác nhận', 'CONFIRMED', 'APPROVED'].includes(order.status) && (
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'Đang chuẩn bị', 'Shop đang đóng gói nông sản')}
                          className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-indigo-700"
                        >
                          Chuẩn bị hàng
                        </button>
                      )}

                      {(order.status === 'Đang chuẩn bị' || order.status === 'PREPARING') && isCentral && (
                        <>
                          <button
                            onClick={() => onUpdateOrderStatus(order.id, 'Chờ Shipper lấy hàng', 'Đã tập kết hàng tại Điểm giao tập trung chờ khách nhận')}
                            className="rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-amber-600"
                          >
                            Sẵn sàng tại điểm tập trung
                          </button>
                          <button
                            onClick={() => onUpdateOrderStatus(order.id, 'Hoàn thành', 'Đã bàn giao hàng cho khách tại Điểm giao tập trung')}
                            className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700"
                          >
                            Xác nhận đã giao tại điểm tập trung
                          </button>
                        </>
                      )}

                      {(order.status === 'Chờ Shipper lấy hàng' || order.status === 'READY_FOR_PICKUP') && isCentral && (
                        <button
                          onClick={() => onUpdateOrderStatus(order.id, 'Hoàn thành', 'Khách đã nhận hàng tại Điểm giao tập trung')}
                          className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700"
                        >
                          Khách đã nhận (Hoàn thành)
                        </button>
                      )}

                      {(order.status === 'Đang chuẩn bị' || order.status === 'PREPARING') && !isCentral && (
                        <>
                          <button
                            onClick={() => onUpdateOrderStatus(order.id, 'Chờ Shipper lấy hàng', 'Đơn sẵn sàng chờ Shipper nhận giao')}
                            className="rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white shadow hover:bg-teal-700"
                          >
                            Đưa lên sàn Shipper
                          </button>
                          <button
                            onClick={() => setAssigningOrderId(order.apiId || null)}
                            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-amber-600"
                          >
                            <FontAwesomeIcon icon={faMotorcycle} />
                            Chỉ định Shipper
                          </button>
                        </>
                      )}

                      {canCancel && (
                        <button
                          onClick={() => { if (window.confirm(`Hủy đơn #${order.id} của ${order.customer}? Khách sẽ nhận thông báo đơn bị hủy.`)) void onUpdateOrderStatus(order.id, 'Đã hủy', 'Cửa hàng hủy đơn hàng'); }}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                        >
                          Hủy đơn
                        </button>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
            {shopOrders.length === 0 && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">Chưa có đơn hàng nào.</div>}
            {stockOrder?.apiId && (
              <StockShortageDialog
                orderApiId={stockOrder.apiId}
                orderCode={stockOrder.id}
                onClose={() => setStockOrder(null)}
                onConfirm={() => onUpdateOrderStatus(stockOrder.id, 'Đã xác nhận', 'Shop đã xác nhận đơn hàng')}
                onResolved={message => onNotify?.(message)}
              />
            )}
          </div>
        </div>
      )}

      {/* "Xóa sản phẩm?" */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="del-product-title" onClick={e => { if (e.target === e.currentTarget && !deleteBusy) setDeleting(null); }}>
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-center gap-3">
              <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl"><ProductPhoto product={deleting} /></span>
              <div className="min-w-0">
                <h3 id="del-product-title" className="text-base font-extrabold text-[#1a2d24]">Xóa sản phẩm?</h3>
                <p className="truncate text-xs text-slate-500">{deleting.name} · còn {deleting.available} {deleting.unit}</p>
              </div>
            </div>
            <ul className="mt-3 list-disc space-y-1 rounded-xl bg-rose-50/60 py-2.5 pl-7 pr-3 text-[11px] text-[#4a2f33]">
              <li>Sản phẩm ngừng bán và biến mất khỏi cửa hàng, bài đăng và giỏ hàng của khách.</li>
              <li>Đơn đã đặt trước đó vẫn giữ nguyên.</li>
              {(deleting.reserved ?? 0) > 0 && <li className="font-semibold text-rose-700">Đang có {deleting.reserved} {deleting.unit} được giữ cho đơn chờ xử lý — hãy xử lý các đơn đó.</li>}
            </ul>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={deleteBusy} onClick={() => setDeleting(null)} className="flex-1 rounded-xl border border-[#d2ddd5] py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Giữ lại</button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={async () => {
                  setDeleteBusy(true);
                  try {
                    await onDeleteProduct?.(deleting.id);
                    setDeleting(null);
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteBusy ? 'Đang xóa…' : 'Xóa sản phẩm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: GROUPS & CUSTOMERS */}
      {activeTab === 'groups' && (() => {
        const selectedGroup = customerGroups.find(g => g.code === targetGroupCode) || customerGroups[0];
        const groupLabelMap = Object.fromEntries(customerGroups.map(g => [g.code, g.name]));
        const fallbackGroupCode = customerGroups.find(g => g.code === 'STUDENT')?.code || customerGroups[0]?.code || 'STUDENT';

        const memberKeyword = memberSearch.trim().toLowerCase();
        const allMembersInGroup = customers.filter(c => c.customer_group === targetGroupCode);
        const filteredMembersInGroup = allMembersInGroup.filter(c =>
          !memberKeyword || `${c.full_name} ${c.email} ${c.phone || ''}`.toLowerCase().includes(memberKeyword)
        );

        const candidateKeyword = custSearch.trim().toLowerCase();
        const filteredCandidates = customers.filter(c => {
          if (c.customer_group === targetGroupCode) return false;
          const matchGrp = custGroupFilter === 'ALL' || c.customer_group === custGroupFilter;
          const matchVerify =
            verifyFilter === 'ALL' ||
            (verifyFilter === 'AVATAR' && Boolean(c.avatar_url)) ||
            (verifyFilter === 'OTP' && Boolean(c.is_phone_verified || c.is_email_verified));
          const matchText = !candidateKeyword || `${c.full_name} ${c.email} ${c.phone || ''}`.toLowerCase().includes(candidateKeyword);
          return matchGrp && matchVerify && matchText;
        });

        const allVisibleCandidateIds = filteredCandidates.map(c => c.id);
        const allCandidatesChecked =
          allVisibleCandidateIds.length > 0 && allVisibleCandidateIds.every(id => selectedCandidateIds.includes(id));

        const toggleCandidate = (id: number) => {
          setSelectedCandidateIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
        };

        const toggleAllCandidates = () => {
          setSelectedCandidateIds(allCandidatesChecked ? [] : allVisibleCandidateIds);
        };

        const renderIdentityBadges = (c: User) => (
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar name={c.full_name} avatarUrl={c.avatar_url} size="md" verified={Boolean(c.avatar_url)} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate text-xs font-extrabold text-[#1e2e26]">{c.full_name}</span>

                {(c.is_phone_verified || c.is_email_verified) && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                    ✓ OTP
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500">
                {c.email} {c.phone ? `· ${c.phone}` : ''}
              </div>
            </div>
          </div>
        );

        return (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-5">
            {/* LEFT: group list + create */}
            <aside className="min-w-0 space-y-3">
              <div className="rounded-2xl border border-[#e3ece6] bg-white shadow-sm">
                <div className="flex items-center justify-between gap-2 border-b border-[#edf2ee] px-4 py-3">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#1a2e24]">
                    <FontAwesomeIcon icon={faUsers} className="text-[#176b52]" /> Nhóm khách hàng
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowCreateGroup(v => !v)}
                    aria-expanded={showCreateGroup}
                    className="rounded-lg bg-[#eef7f1] px-2.5 py-1 text-[11px] font-bold text-[#176b52] hover:bg-emerald-100"
                  >
                    {showCreateGroup ? 'Đóng' : '+ Tạo nhóm'}
                  </button>
                </div>

                {showCreateGroup && (
                  <form onSubmit={handleCreateGroup} className="space-y-2.5 border-b border-[#edf2ee] bg-[#f8fbf9] p-4">
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-600">Tên nhóm *</span>
                      <input
                        type="text"
                        required
                        value={newGroupForm.name}
                        onChange={e => setNewGroupForm({ ...newGroupForm, name: e.target.value })}
                        placeholder="VD: Khách VIP Chung cư A"
                        className="mt-1 w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-bold text-slate-600">Mã nhóm</span>
                        <input
                          type="text"
                          value={newGroupForm.code}
                          onChange={e => setNewGroupForm({ ...newGroupForm, code: e.target.value.toUpperCase() })}
                          placeholder="Tự tạo"
                          className="mt-1 w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs uppercase focus:border-[#176b52] focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-bold text-slate-600">Giảm giá (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={90}
                          value={newGroupForm.discount_percent}
                          onChange={e => setNewGroupForm({ ...newGroupForm, discount_percent: Number(e.target.value) })}
                          className="mt-1 w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-[11px] font-bold text-slate-600">Mô tả</span>
                      <input
                        type="text"
                        value={newGroupForm.description}
                        onChange={e => setNewGroupForm({ ...newGroupForm, description: e.target.value })}
                        placeholder="Chính sách giá áp dụng…"
                        className="mt-1 w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={groupBusy || !newGroupForm.name.trim()}
                      className="w-full rounded-xl bg-[#176b52] py-2.5 text-xs font-bold text-white shadow hover:bg-[#125340] disabled:opacity-50"
                    >
                      {groupBusy ? 'Đang tạo…' : 'Tạo nhóm'}
                    </button>
                  </form>
                )}

                {/* Phones: horizontal chips; desktop: vertical list */}
                <div className="flex gap-2 overflow-x-auto p-3 scrollbar-hide lg:max-h-[520px] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
                  {customerGroups.map(g => {
                    const selected = targetGroupCode === g.code;
                    const memberCount = customers.filter(c => c.customer_group === g.code).length;
                    return (
                      <button
                        key={g.code}
                        type="button"
                        onClick={() => {
                          setTargetGroupCode(g.code);
                          setSelectedCandidateIds([]);
                        }}
                        aria-pressed={selected}
                        className={`w-44 shrink-0 rounded-xl border px-3 py-2.5 text-left transition lg:w-full ${
                          selected ? 'border-[#176b52] bg-emerald-50 ring-1 ring-[#176b52]' : 'border-[#e3ece6] bg-white hover:border-[#176b52]/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-extrabold text-[#1a2e24]">{g.name}</span>
                          <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">-{Number(g.discount_percent || 0)}%</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                          <span className="truncate font-mono">{g.code}</span>
                          <span className="shrink-0 font-bold text-[#176b52]">{memberCount} người</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            {/* RIGHT: selected group */}
            <section className="min-w-0 overflow-hidden rounded-2xl border border-[#e3ece6] bg-white shadow-sm">
              <header className="border-b border-[#edf2ee] bg-[#f6faf7] px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-base font-extrabold text-[#1a2e24]">{selectedGroup?.name || targetGroupCode}</h3>
                    <p className="mt-0.5 break-words text-[11px] text-slate-500">
                      Mã <span className="font-mono">{selectedGroup?.code || targetGroupCode}</span> · Giảm {Number(selectedGroup?.discount_percent || 0)}%
                      {selectedGroup?.description ? ` · ${selectedGroup.description}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#176b52] px-3 py-1 text-xs font-extrabold text-white">{allMembersInGroup.length} thành viên</span>
                </div>
                <div className="mt-3 flex gap-1.5" role="tablist">
                  {[
                    { id: 'members', label: `Thành viên (${allMembersInGroup.length})` },
                    { id: 'add', label: `Thêm khách (${filteredCandidates.length})` },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={groupPanel === t.id}
                      onClick={() => setGroupPanel(t.id as 'members' | 'add')}
                      className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                        groupPanel === t.id ? 'bg-white text-[#176b52] shadow-sm ring-1 ring-[#d6e7dc]' : 'text-slate-500 hover:bg-white/70'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </header>

              {groupPanel === 'members' ? (
                <>
                  <div className="border-b border-[#f0f4f1] p-3 sm:px-5">
                    <input
                      type="search"
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      placeholder="Tìm thành viên theo tên, email, SĐT…"
                      className="w-full rounded-xl border border-[#d2ddd5] px-3 py-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                  </div>
                  <ul className="max-h-[560px] divide-y divide-[#f0f4f1] overflow-y-auto">
                    {filteredMembersInGroup.map(c => (
                      <li key={c.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        {renderIdentityBadges(c)}
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-slate-400">Chuyển nhóm</span>
                            <select
                              value={c.customer_group}
                              disabled={groupBusy}
                              onChange={e => {
                                if (e.target.value !== c.customer_group) void handleAssignToGroup(c, e.target.value);
                              }}
                              className="max-w-[150px] rounded-lg border border-[#d2ddd5] bg-white px-2 py-1.5 text-[11px] font-semibold text-[#176b52]"
                            >
                              {customerGroups.map(g => (
                                <option key={g.code} value={g.code}>{g.name}</option>
                              ))}
                            </select>
                          </label>
                          {targetGroupCode !== fallbackGroupCode && (
                            <button
                              type="button"
                              disabled={groupBusy}
                              onClick={() => void handleAssignToGroup(c, fallbackGroupCode)}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              Gỡ khỏi nhóm
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                    {filteredMembersInGroup.length === 0 && (
                      <li className="p-8 text-center text-xs text-slate-400">
                        {allMembersInGroup.length === 0 ? (
                          <>
                            Nhóm chưa có thành viên.{' '}
                            <button type="button" onClick={() => setGroupPanel('add')} className="font-bold text-[#176b52] underline">Thêm khách hàng</button>
                          </>
                        ) : (
                          'Không có thành viên khớp từ khóa.'
                        )}
                      </li>
                    )}
                  </ul>
                </>
              ) : (
                <>
                  <div className="space-y-2.5 border-b border-[#f0f4f1] p-3 sm:px-5">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                      <input
                        type="search"
                        value={custSearch}
                        onChange={e => setCustSearch(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') loadShopCustomers();
                        }}
                        placeholder="Tìm tên, email, SĐT…"
                        className="w-full min-w-0 rounded-xl border border-[#d2ddd5] px-3 py-2 text-xs focus:border-[#176b52] focus:outline-none"
                      />
                      <select
                        value={custGroupFilter}
                        onChange={e => setCustGroupFilter(e.target.value)}
                        aria-label="Lọc theo nhóm hiện tại"
                        className="rounded-xl border border-[#d2ddd5] bg-white px-2.5 py-2 text-xs"
                      >
                        <option value="ALL">Mọi nhóm khác</option>
                        {customerGroups
                          .filter(g => g.code !== targetGroupCode)
                          .map(g => (
                            <option key={g.code} value={g.code}>Đang ở: {g.name}</option>
                          ))}
                      </select>
                      <select
                        value={verifyFilter}
                        onChange={e => setVerifyFilter(e.target.value as any)}
                        aria-label="Lọc theo xác thực"
                        className="rounded-xl border border-[#d2ddd5] bg-white px-2.5 py-2 text-xs"
                      >
                        <option value="ALL">Mọi trạng thái</option>
                        <option value="AVATAR">Có ảnh đại diện</option>
                        <option value="OTP">Đã xác thực OTP</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {filteredCandidates.length > 0 ? (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-[11px] font-bold text-[#3d5045]">
                          <input type="checkbox" checked={allCandidatesChecked} onChange={toggleAllCandidates} className="h-4 w-4 rounded accent-[#176b52]" />
                          Chọn tất cả ({filteredCandidates.length})
                        </label>
                      ) : <span />}
                      <div className="flex gap-2">
                        <button type="button" onClick={loadShopCustomers} className="rounded-xl bg-[#eef7f1] px-3 py-1.5 text-xs font-bold text-[#176b52] hover:bg-emerald-100">
                          Làm mới
                        </button>
                        <button
                          type="button"
                          disabled={groupBusy || selectedCandidateIds.length === 0}
                          onClick={() => void handleBatchAssignSelected()}
                          className="rounded-xl bg-[#176b52] px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#125340] disabled:opacity-40"
                        >
                          Thêm {selectedCandidateIds.length || ''} khách đã chọn
                        </button>
                      </div>
                    </div>
                  </div>
                  <ul className="max-h-[560px] divide-y divide-[#f0f4f1] overflow-y-auto">
                    {filteredCandidates.map(c => {
                      const checked = selectedCandidateIds.includes(c.id);
                      return (
                        <li key={c.id} className={`flex flex-col gap-2.5 p-4 transition sm:flex-row sm:items-center sm:justify-between sm:px-5 ${checked ? 'bg-emerald-50/50' : ''}`}>
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                            <input type="checkbox" checked={checked} onChange={() => toggleCandidate(c.id)} aria-label={`Chọn ${c.full_name}`} className="h-4 w-4 shrink-0 rounded accent-[#176b52]" />
                            {renderIdentityBadges(c)}
                          </label>
                          <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{groupLabelMap[c.customer_group] || c.customer_group}</span>
                            <button
                              type="button"
                              disabled={groupBusy}
                              onClick={() => void handleAssignToGroup(c, targetGroupCode)}
                              className="rounded-xl bg-[#176b52] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#125340] disabled:opacity-50"
                            >
                              + Thêm
                            </button>
                          </div>
                        </li>
                      );
                    })}
                    {filteredCandidates.length === 0 && (
                      <li className="p-8 text-center text-xs text-slate-400">Không có khách hàng nào ngoài nhóm khớp bộ lọc.</li>
                    )}
                  </ul>
                </>
              )}
            </section>
          </div>
        );
      })()}

      {/* Tab Content: REVIEWS */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#1e2d25]">Đánh giá từ khách hàng & Phản hồi của Shop</h3>
          <div className="space-y-4">
            {reviews.map(rev => (
              <div key={rev.id} className="rounded-2xl border border-[#e8ede8] bg-white p-5 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-[#1e2d25]">{rev.user_name || 'Khách hàng FreshFlow'}</div>
                    <div className="text-yellow-500 text-xs">
                      {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                    </div>
                  </div>
                  <span className="text-[10px] text-[#86968d]">
                    {new Date(rev.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                <p className="text-xs text-[#4c5e53] bg-[#f9faf9] p-3 rounded-xl border border-[#edf2ee]">
                  "{rev.comment}"
                </p>

                {rev.shop_reply ? (
                  <div className="ml-4 rounded-xl border-l-4 border-[#176b52] bg-[#f2f8f4] p-3 text-xs text-[#1e3d2e]">
                    <div className="font-bold">Phản hồi của Shop:</div>
                    <div className="mt-1">{rev.shop_reply}</div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Viết câu trả lời cảm ơn hoặc hỗ trợ khách hàng..."
                      value={replyText[rev.id] || ''}
                      onChange={e => setReplyText({ ...replyText, [rev.id]: e.target.value })}
                      className="flex-1 rounded-xl border border-[#d2ddd5] p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                    <button
                      onClick={() => handleReplySubmit(rev.id)}
                      className="flex items-center gap-1.5 rounded-xl bg-[#176b52] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#125340]"
                    >
                      <FontAwesomeIcon icon={faReply} />
                      Gửi trả lời
                    </button>
                  </div>
                )}
              </div>
            ))}
            {reviews.length === 0 && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">Chưa có đánh giá. Khi khách hàng đánh giá sản phẩm của Shop, nội dung sẽ xuất hiện tại đây.</div>}
          </div>
        </div>
      )}

      {/* Modal Phân công Shipper */}
      {assigningOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-[#1a2d24]">Chọn Shipper giao đơn hàng</h3>
            <p className="mt-1 text-xs text-[#7e8f85]">Hệ thống sẽ gửi thông báo và đơn hàng cho Shipper được chọn.</p>

            <form onSubmit={handleAssignSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-[#3d5045]">Danh sách Shipper sẵn sàng</label>
                <select
                  value={selectedShipperId}
                  onChange={e => setSelectedShipperId(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                >
                  {shippers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.vehicle_info || 'Xe máy'}) - {s.phone || 'Sẵn sàng'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAssigningOrderId(null)}
                  className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-[#5c6e64]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#176b52] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#125340]"
                >
                  Xác nhận giao Shipper
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
