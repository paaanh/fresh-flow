import {
  faAppleWhole, faBell, faChartLine, faCircleQuestion, faClipboardList,
  faComments, faGear, faMessage, faMotorcycle, faNewspaper, faSliders, faStar, faStore,
  faTruck, faUser, faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { normalizeOrderLines } from '@/components/order-items';
import type { FinancialSummary, Order, Product, ProductRequest } from '@/types/domain';
export const defaultFinancialSummary: FinancialSummary = {
  total_users: 0, total_shops: 0, total_products: 0, total_orders: 0,
  delivery_success_rate: 0, total_revenue: 0, total_subtotal: 0, total_vat: 0,
  total_delivery_fee: 0, total_paid: 0, total_debt: 0, total_collected_by_shipper: 0,
  status_distribution: {}, orders_by_date: [], shop_breakdown: [], group_breakdown: [],
};

export const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + '₫';

export function normalizeProduct(raw: any): Product {
  const category = typeof raw.category === 'string' ? raw.category : raw.category?.name || raw.category_name || 'Rau củ';
  const prod: Product = {
    id: Number(raw.id),
    name: raw.name || raw.product_name || 'Sản phẩm',
    description: raw.description || '',
    category,
    unit: typeof raw.unit === 'string' ? raw.unit : raw.unit?.name || raw.unit_name || 'phần',
    price: Number(raw.customer_price ?? raw.price ?? raw.unit_price ?? raw.base_price ?? 0),
    available: Number(raw.available ?? raw.available_quantity ?? raw.quantity_available ?? 0),
    ordered: Number(raw.pending_quantity ?? raw.ordered ?? 0),
    approved: Number(raw.approved_quantity ?? raw.approved ?? 0),
    color: raw.color || '#e7eed6',
    image: raw.image_url || raw.image,
    images: raw.images || '',
    attached_services: raw.attached_services || '',
    tag: raw.tag,
    shop_id: raw.shop_id,
    shop_name: raw.shop_name,
    base_price: raw.base_price != null ? Number(raw.base_price) : undefined,
    customer_price: raw.customer_price != null ? Number(raw.customer_price) : undefined,
    list_price: raw.list_price != null ? Number(raw.list_price) : raw.base_price != null ? Number(raw.base_price) : undefined,
    sale_price: raw.sale_price != null ? Number(raw.sale_price) : null,
    sale_start_at: raw.sale_start_at || null,
    sale_end_at: raw.sale_end_at || null,
    sale_status: raw.sale_status || 'NONE',
    stock: raw.stock_quantity != null ? Number(raw.stock_quantity) : undefined,
    reserved: raw.reserved_quantity != null ? Number(raw.reserved_quantity) : undefined,
  };

  // If there is an active sale and sale_price is lower than price, use sale_price
  if (prod.sale_status === 'ACTIVE' && prod.sale_price != null && prod.sale_price > 0 && prod.sale_price < prod.price) {
    if (!prod.list_price || prod.list_price <= prod.sale_price) {
      prod.list_price = prod.price;
    }
    prod.price = prod.sale_price;
  }

  return prod;
}

/**
 * Price display for a product (customer grid, product page, cart, shop cards).
 * - effectivePrice: what the viewer pays (customer_price from the API = MIN(group price, running Sale)).
 * - originalPrice: the product's own standard price (giá gốc / base_price) — the same reference for
 *   buyers and sellers, so a Sale set by the shop shows struck through on both sides. The viewer's
 *   group price is not used as reference: when a group discount happens to equal the Sale price the
 *   buyer would otherwise see no Sale at all.
 * - isSale: the shop has a Sale running and the viewer pays less than the standard price.
 */
export function getProductPricing(product: Pick<Product, 'sale_status' | 'list_price' | 'base_price' | 'price' | 'sale_price'>) {
  const effectivePrice = Number(product.price || 0);
  const base = Number(product.base_price || 0) > 0 ? Number(product.base_price) : Number(product.list_price || 0) > 0 ? Number(product.list_price) : effectivePrice;
  const saleRunning = product.sale_status === 'ACTIVE' && product.sale_price != null && Number(product.sale_price) > 0;
  const isSale = saleRunning && effectivePrice > 0 && effectivePrice < base;
  return {
    isSale,
    originalPrice: base,
    effectivePrice,
    discountPercent: isSale ? Math.round((1 - effectivePrice / base) * 100) : 0,
  };
}

/** % the customer's group pays below the standard price when no Sale is running (0 = none). */
export function groupDiscountPercent(product: Pick<Product, 'sale_status' | 'list_price' | 'base_price' | 'price' | 'sale_price'>) {
  const { isSale, originalPrice, effectivePrice } = getProductPricing(product);
  if (isSale || !(originalPrice > 0) || !(effectivePrice > 0) || effectivePrice >= originalPrice) return 0;
  return Math.round((1 - effectivePrice / originalPrice) * 100);
}

/** Product has an active Sale and the customer price is below the list price. */
export function isOnSale(product: Pick<Product, 'sale_status' | 'list_price' | 'base_price' | 'price' | 'sale_price'>) {
  return getProductPricing(product).isSale;
}

export function normalizeOrder(raw: any): Order {
  const states: Record<string, string> = {
    PENDING: 'Chờ xác nhận',
    CONFIRMED: 'Đã xác nhận',
    APPROVED: 'Đã xác nhận',
    PREPARING: 'Đang chuẩn bị',
    READY_FOR_PICKUP: 'Chờ Shipper lấy hàng',
    PICKED_UP: 'Shipper đã lấy hàng',
    DELIVERING: 'Đang giao',
    IN_TRANSIT: 'Đang giao',
    COMPLETED: 'Hoàn thành',
    DELIVERED: 'Hoàn thành',
    REJECTED: 'Từ chối',
    CANCELLED: 'Đã hủy',
  };
  const status = raw.status || 'PENDING';
  // Number of different products (quantities can be 1,25 kg + 3 nải: adding them up means nothing)
  const itemCount = Array.isArray(raw.items)
    ? new Set(raw.items.map((item: any) => item.product_id ?? item.batch_id ?? item.id)).size
    : Number(raw.item_count || 0);

  return {
    apiId: Number(raw.id),
    id: String(raw.order_number || raw.code || raw.id || '—'),
    customer: raw.customer_name || raw.customer?.full_name || raw.user?.full_name || 'Khách hàng',
    customer_avatar_url: raw.customer_avatar_url || null,
    customer_group: raw.customer_group || null,
    customer_is_verified: Boolean(raw.customer_is_verified),
    date: raw.created_at
      ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(raw.created_at))
      : raw.date || 'Mới tạo',
    total: Number(raw.total ?? raw.total_amount ?? 0),
    subtotal: Number(raw.subtotal || 0),
    vat_rate: Number(raw.vat_rate || 0.08),
    vat_amount: Number(raw.vat_amount || 0),
    delivery_fee: Number(raw.delivery_fee || 0),
    paid_amount: Number(raw.paid_amount || 0),
    debt_amount: Number(raw.debt_amount || 0),
    payment_status: raw.payment_status || 'UNPAID',
    payment_method: raw.payment_method || 'COD',
    cash_collected_by_shipper: Number(raw.cash_collected_by_shipper || 0),
    status: states[String(status).toUpperCase()] || status,
    createdAt: raw.created_at,
    lines: normalizeOrderLines(raw.items),
    items: `${itemCount} sản phẩm`,
    delivery:
      raw.delivery_type === 'PICKUP' || raw.delivery_type === 'CENTRAL'
        ? 'Điểm giao tập trung'
        : 'Giao tận nơi',
    delivery_address: raw.delivery_address || '',
    recipient_name: raw.recipient_name || '',
    recipient_phone: raw.recipient_phone || '',
    shop_id: raw.shop_id,
    shop_name: raw.shop_name,
    shipper_id: raw.shipper_id,
    shipper_name: raw.shipper_name,
    shipper_phone: raw.shipper_phone,
    shipper_vehicle: raw.shipper_vehicle,
    shipper_avatar_url: raw.shipper_avatar_url || null,
    note: raw.note,
    inventory_state: raw.inventory_state || 'NONE',
  };
}

export const ORDER_STATUS_PRIORITY: Record<string, number> = {
  'Chờ xác nhận': 1,
  'Chờ duyệt': 1,
  PENDING: 1,
  'Đã xác nhận': 2,
  'Đã duyệt': 2,
  CONFIRMED: 2,
  APPROVED: 2,
  'Đang chuẩn bị': 3,
  PREPARING: 3,
  'Chờ Shipper lấy hàng': 4,
  READY_FOR_PICKUP: 4,
  'Shipper đã lấy hàng': 5,
  PICKED_UP: 5,
  'Đang giao': 6,
  DELIVERING: 6,
  'Hoàn thành': 7,
  COMPLETED: 7,
  'Từ chối': 8,
  REJECTED: 8,
  'Đã hủy': 9,
  CANCELLED: 9,
};

export function sortOrdersByPriority(list: Order[]): Order[] {
  return [...list].sort((a, b) => {
    const pa = ORDER_STATUS_PRIORITY[a.status] ?? 5;
    const pb = ORDER_STATUS_PRIORITY[b.status] ?? 5;
    if (pa !== pb) return pa - pb;
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
}

export function getOrderVisualMeta(status: string) {
  switch (status) {
    case 'Chờ xác nhận':
    case 'Chờ duyệt':
    case 'PENDING':
      return {
        border: 'border-l-4 border-l-amber-500',
        badge: 'bg-amber-100 text-amber-800 border border-amber-200',
        rowBg: 'bg-amber-50/20',
        isDone: false,
        muted: false,
      };
    case 'Đã xác nhận':
    case 'Đã duyệt':
    case 'CONFIRMED':
      return {
        border: 'border-l-4 border-l-blue-500',
        badge: 'bg-blue-100 text-blue-800 border border-blue-200',
        rowBg: 'bg-blue-50/15',
        isDone: false,
        muted: false,
      };
    case 'Đang chuẩn bị':
    case 'PREPARING':
      return {
        border: 'border-l-4 border-l-indigo-500',
        badge: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
        rowBg: 'bg-indigo-50/15',
        isDone: false,
        muted: false,
      };
    case 'Chờ Shipper lấy hàng':
    case 'READY_FOR_PICKUP':
      return {
        border: 'border-l-4 border-l-orange-500',
        badge: 'bg-orange-100 text-orange-800 border border-orange-200',
        rowBg: 'bg-orange-50/15',
        isDone: false,
        muted: false,
      };
    case 'Shipper đã lấy hàng':
    case 'PICKED_UP':
    case 'Đang giao':
    case 'DELIVERING':
      return {
        border: 'border-l-4 border-l-cyan-500',
        badge: 'bg-cyan-100 text-cyan-800 border border-cyan-200',
        rowBg: 'bg-cyan-50/20',
        isDone: false,
        muted: false,
      };
    case 'Hoàn thành':
    case 'COMPLETED':
      return {
        border: 'border-l-4 border-l-slate-400',
        badge: 'bg-slate-200 text-slate-700 border border-slate-300',
        rowBg: 'bg-slate-100/75 opacity-75 text-slate-500',
        isDone: true,
        muted: true,
      };
    case 'Từ chối':
    case 'Đã hủy':
    case 'REJECTED':
    case 'CANCELLED':
      return {
        border: 'border-l-4 border-l-rose-400',
        badge: 'bg-rose-100 text-rose-700 border border-rose-200',
        rowBg: 'bg-slate-100/60 opacity-65 text-slate-400',
        isDone: true,
        muted: true,
      };
    default:
      return {
        border: 'border-l-4 border-l-emerald-500',
        badge: 'bg-emerald-50 text-[#176b52]',
        rowBg: 'bg-white',
        isDone: false,
        muted: false,
      };
  }
}

export function normalizeRequest(raw: any): ProductRequest {
  const states: Record<string, string> = {
    OPEN: 'Mới',
    ACCEPTED: 'Đang xử lý',
    REJECTED: 'Từ chối',
    NEW: 'Mới',
    QUOTED: 'Đã báo giá',
    FULFILLED: 'Hoàn tất',
  };
  const desc = String(raw.description || '');
  let parsedCategory = raw.category_name || raw.category || '';
  let parsedQty = raw.quantity_requested ?? raw.quantity ?? '';
  if (!parsedCategory && desc.includes('Danh mục:')) {
    const match = desc.match(/Danh mục:\s*([^;|.]+)/i);
    if (match) parsedCategory = match[1].trim();
  }
  if (!parsedQty && (desc.includes('số lượng:') || desc.includes('Số lượng:'))) {
    const match = desc.match(/số lượng:\s*([^;|.]+)/i);
    if (match) parsedQty = match[1].trim();
  }
  return {
    id: Number(raw.id),
    name: raw.product_name || raw.name || 'Mặt hàng',
    category: parsedCategory || 'Nông sản theo yêu cầu',
    quantity: String(parsedQty || (desc ? desc : 'Chưa xác định')),
    customer: raw.customer_name || raw.user?.full_name || 'Khách hàng',
    date: raw.created_at
      ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(raw.created_at))
      : raw.date || 'Mới tạo',
    status: states[String(raw.status || 'NEW').toUpperCase()] || raw.status || 'Mới',
    description: desc,
    admin_response: raw.admin_response || '',
    quoted_price: raw.quoted_price != null ? Number(raw.quoted_price) : null,
    product_id: raw.product_id ?? null,
    linked_product_name: raw.linked_product_name ?? null,
    linked_product_available: raw.linked_product_available != null ? Number(raw.linked_product_available) : null,
    handled_by_name: raw.handled_by_name ?? null,
    customer_phone: raw.customer_phone ?? null,
    updated_at: raw.updated_at ?? null,
  };
}

export const toApiOrderStatus = (status: string) =>
  ({
    'Chờ xác nhận': 'PENDING',
    'Đã xác nhận': 'CONFIRMED',
    'Đã duyệt': 'CONFIRMED',
    'Đang chuẩn bị': 'PREPARING',
    'Chờ Shipper lấy hàng': 'READY_FOR_PICKUP',
    'Shipper đã lấy hàng': 'PICKED_UP',
    'Đang giao': 'DELIVERING',
    'Hoàn thành': 'COMPLETED',
    'Từ chối': 'REJECTED',
    'Đã hủy': 'CANCELLED',
  }[status] || status);

export const adminSections = [
  { label: 'TỔNG QUAN', links: [{ name: 'Tổng quan', href: '/admin/dashboard', icon: faChartLine }, { name: 'Bảng tin', href: '/newfeed', icon: faNewspaper }] },
  { label: 'BÁN HÀNG', links: [{ name: 'Sản phẩm', href: '/admin/products', icon: faAppleWhole }, { name: 'Đơn hàng', href: '/admin/orders', icon: faClipboardList }] },
  { label: 'VẬN HÀNH', links: [{ name: 'Giao hàng', href: '/admin/deliveries', icon: faTruck }, { name: 'Người dùng', href: '/admin/customers', icon: faUsers }, { name: 'Yêu cầu hàng', href: '/admin/requests', icon: faMessage }] },
  { label: 'HỆ THỐNG', links: [{ name: 'Báo cáo', href: '/admin/reports', icon: faChartLine }, { name: 'Kiểm duyệt', href: '/admin/moderation', icon: faSliders }, { name: 'Thông báo', href: '/admin/notifications', icon: faBell }, { name: 'Cài đặt', href: '/admin/settings', icon: faGear }] },
];

export const shopSections = [
  { label: 'CỬA HÀNG', links: [{ name: 'Tổng quan', href: '/shop', icon: faStore }, { name: 'Bảng tin', href: '/newfeed', icon: faNewspaper }] },
  { label: 'BÁN HÀNG', links: [{ name: 'Sản phẩm', href: '/shop/products', icon: faAppleWhole }, { name: 'Đơn hàng', href: '/shop/orders', icon: faClipboardList }, { name: 'Nhóm & Khách hàng', href: '/shop/groups', icon: faUsers }, { name: 'Yêu cầu hàng', href: '/requests', icon: faMessage }, { name: 'Đánh giá', href: '/shop/reviews', icon: faStar }] },
  { label: 'TƯƠNG TÁC', links: [{ name: 'Tin nhắn', href: '/chat', icon: faComments }, { name: 'Thông báo', href: '/notifications', icon: faBell }] },
];

export const customerSections = [
  { label: 'MUA SẮM', links: [{ name: 'Bảng tin', href: '/newfeed', icon: faNewspaper }, { name: 'Sản phẩm', href: '/products', icon: faAppleWhole }, { name: 'Đơn hàng', href: '/orders', icon: faClipboardList }] },
  { label: 'TIỆN ÍCH', links: [{ name: 'Yêu cầu hàng', href: '/requests', icon: faMessage }, { name: 'Hồ sơ', href: '/profile', icon: faUser }, { name: 'Thông báo', href: '/notifications', icon: faBell }, { name: 'Trợ giúp', href: '/help', icon: faCircleQuestion }] },
];

export const shipperSections = [
  { label: 'GIAO HÀNG', links: [{ name: 'Nhận đơn', href: '/shipper', icon: faMotorcycle }, { name: 'Lịch sử', href: '/shipper/history', icon: faClipboardList }] },
  { label: 'CÁ NHÂN', links: [{ name: 'Hồ sơ', href: '/profile', icon: faUser }, { name: 'Thông báo', href: '/notifications', icon: faBell }] },
];

export const titleMap: Record<string, string> = {
  dashboard: 'Tổng quan',
  newfeed: 'Bảng tin',
  orders: 'Đơn hàng',
  products: 'Sản phẩm',
  inventory: 'Tồn kho',
  deliveries: 'Giao hàng',
  customers: 'Người dùng',
  requests: 'Yêu cầu hàng',
  reports: 'Báo cáo',
  moderation: 'Kiểm duyệt',
  pricing: 'Bảng giá nhóm',
  settings: 'Cài đặt',
  notifications: 'Thông báo',
  profile: 'Hồ sơ',
  help: 'Trợ giúp',
  cart: 'Giỏ hàng',
  checkout: 'Thanh toán',
  shop: 'Kênh Shop',
  groups: 'Nhóm & Khách hàng',
  reviews: 'Đánh giá',
  history: 'Lịch sử giao hàng',
  shipper: 'Kênh Shipper',
  chat: 'Tin nhắn',
};
