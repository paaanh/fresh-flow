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
  return {
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
  };
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
  const itemCount = Array.isArray(raw.items)
    ? raw.items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)
    : Number(raw.item_count || 0);

  return {
    apiId: Number(raw.id),
    id: String(raw.order_number || raw.code || raw.id || '—'),
    customer: raw.customer_name || raw.customer?.full_name || raw.user?.full_name || 'Khách hàng',
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
    note: raw.note,
  };
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
  { label: 'TỔNG QUAN', links: [{ name: 'Tổng quan & Tài chính', href: '/admin/dashboard', icon: faChartLine }, { name: 'Bảng tin Newfeed', href: '/newfeed', icon: faNewspaper }] },
  { label: 'QUẢNG BÁ & BÁN HÀNG', links: [{ name: 'Sản phẩm & Tồn kho', href: '/admin/products', icon: faAppleWhole }, { name: 'Quản lý Đơn hàng', href: '/admin/orders', icon: faClipboardList }] },
  { label: 'VẬN HÀNH & ĐỐI TÁC', links: [{ name: 'Giao hàng & Shipper', href: '/admin/deliveries', icon: faTruck }, { name: 'Khách hàng & Nhóm', href: '/admin/customers', icon: faUsers }, { name: 'Yêu cầu mặt hàng', href: '/admin/requests', icon: faMessage }] },
  { label: 'QUẢN TRỊ NÂNG CAO', links: [{ name: 'Báo cáo & Đối soát', href: '/admin/reports', icon: faChartLine }, { name: 'Kiểm duyệt nội dung', href: '/admin/moderation', icon: faSliders }, { name: 'Thông báo', href: '/admin/notifications', icon: faBell }, { name: 'Cài đặt hệ thống', href: '/admin/settings', icon: faGear }] },
];

export const shopSections = [
  { label: 'CỬA HÀNG CỦA BẠN', links: [{ name: 'Shop Portal', href: '/shop', icon: faStore }, { name: 'Bảng tin Newfeed', href: '/newfeed', icon: faNewspaper }] },
  { label: 'SẢN PHẨM & ĐƠN HÀNG', links: [{ name: 'Sản phẩm của Shop', href: '/shop/products', icon: faAppleWhole }, { name: 'Đơn hàng phát sinh', href: '/shop/orders', icon: faClipboardList }, { name: 'Yêu cầu mặt hàng', href: '/requests', icon: faMessage }, { name: 'Đánh giá & Review', href: '/shop/reviews', icon: faStar }] },
  { label: 'TƯƠNG TÁC', links: [{ name: 'Tin nhắn với khách', href: '/chat', icon: faComments }, { name: 'Thông báo Shop', href: '/notifications', icon: faBell }] },
];

export const customerSections = [
  { label: 'KHÁM PHÁ & MUA SẮM', links: [{ name: 'Bảng tin Newfeed', href: '/newfeed', icon: faNewspaper }, { name: 'Cửa hàng nông sản', href: '/products', icon: faAppleWhole }, { name: 'Đơn hàng của tôi', href: '/orders', icon: faClipboardList }] },
  { label: 'TIỆN ÍCH', links: [{ name: 'Yêu cầu mặt hàng', href: '/requests', icon: faMessage }, { name: 'Hồ sơ & Địa chỉ', href: '/profile', icon: faUser }, { name: 'Thông báo', href: '/notifications', icon: faBell }, { name: 'Trợ giúp', href: '/help', icon: faCircleQuestion }] },
];

export const shipperSections = [
  { label: 'VẬN CHUYỂN & GIAO HÀNG', links: [{ name: 'Shipper Portal', href: '/shipper', icon: faMotorcycle }, { name: 'Lịch sử giao hàng', href: '/shipper/history', icon: faClipboardList }] },
  { label: 'CÁ NHÂN', links: [{ name: 'Hồ sơ phương tiện', href: '/profile', icon: faUser }, { name: 'Thông báo', href: '/notifications', icon: faBell }] },
];

export const titleMap: Record<string, string> = {
  dashboard: 'Tổng quan & Tài chính',
  newfeed: 'Bảng tin Newfeed',
  orders: 'Quản lý Đơn hàng',
  products: 'Sản phẩm tươi',
  inventory: 'Quản lý tồn kho',
  deliveries: 'Điều phối giao hàng',
  customers: 'Khách hàng & Nhóm',
  requests: 'Yêu cầu mặt hàng',
  reports: 'Báo cáo & Đối soát tài chính',
  moderation: 'Kiểm duyệt nội dung',
  pricing: 'Giá theo nhóm khách hàng',
  settings: 'Cài đặt hệ thống',
  notifications: 'Thông báo',
  profile: 'Hồ sơ & Địa chỉ nhận hàng',
  help: 'Trung tâm trợ giúp',
  cart: 'Giỏ hàng',
  checkout: 'Xác nhận đơn hàng & Thuế VAT',
  shop: 'Shop Portal',
  shipper: 'Shipper Portal',
  chat: 'Trò chuyện Realtime',
};
