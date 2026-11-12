import type { OrderLine } from '@/components/order-items';

export type UserRole = 'ADMIN' | 'SHOP' | 'CUSTOMER' | 'SHIPPER';

export type User = {
  id: number;
  email: string;
  full_name: string;
  phone?: string | null;
  role: UserRole;
  customer_group: string;
  is_active: boolean;
  is_email_verified?: boolean;
  is_phone_verified?: boolean;
  shop_name?: string | null;
  shop_description?: string;
  shop_address?: string;
  avatar_url?: string | null;
  vehicle_info?: string;
};

export type Product = {
  id: number;
  name: string;
  description?: string;
  category: string;
  unit: string;
  price: number;
  available: number;
  ordered: number;
  approved: number;
  color: string;
  image?: string;
  images?: string;
  attached_services?: string;
  tag?: string;
  shop_id?: number | null;
  shop_name?: string | null;
  base_price?: number;
  customer_price?: number;
  /** Giá theo nhóm khách hàng trước khi áp dụng Sale */
  list_price?: number;
  sale_price?: number | null;
  sale_start_at?: string | null;
  sale_end_at?: string | null;
  sale_status?: 'NONE' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED';
  /** Tồn kho thực tế trên kệ */
  stock?: number;
  /** Đang giữ chỗ cho đơn đã xác nhận */
  reserved?: number;
};

export type Order = {
  apiId?: number;
  id: string;
  customer: string;
  customer_name?: string;
  customer_avatar_url?: string | null;
  customer_group?: string | null;
  customer_is_verified?: boolean;
  date: string;
  total: number;
  subtotal?: number;
  vat_rate?: number;
  vat_amount?: number;
  delivery_fee?: number;
  discount_amount?: number;
  paid_amount?: number;
  debt_amount?: number;
  payment_status?: string;
  payment_method?: string;
  cash_collected_by_shipper?: number;
  status: string;
  items: string;
  delivery: string;
  delivery_address?: string;
  recipient_name?: string;
  recipient_phone?: string;
  expected_delivery_time?: string;
  shop_id?: number | null;
  shop_name?: string | null;
  shipper_id?: number | null;
  shipper_name?: string | null;
  shipper_phone?: string | null;
  shipper_vehicle?: string | null;
  shipper_avatar_url?: string | null;
  note?: string;
  inventory_state?: 'NONE' | 'RESERVED' | 'SHIPPED' | 'RELEASED' | string;
  lines?: OrderLine[];
  createdAt?: string;
};

export type ProductRequest = {
  id: number;
  name: string;
  category: string;
  quantity: string;
  customer: string;
  date: string;
  status: string;
  description?: string;
  admin_response?: string;
  quoted_price?: number | null;
  product_id?: number | null;
  linked_product_name?: string | null;
  linked_product_available?: number | null;
  handled_by_name?: string | null;
  customer_phone?: string | null;
  updated_at?: string | null;
};

export type PostProductInfo = {
  id: number;
  name: string;
  unit: string;
  category_name?: string;
  base_price: number;
  sale_price?: number;
  effective_price: number;
  available_quantity: number;
  image_url?: string;
  group_prices?: Record<string, number>;
  /** Giá đặt riêng theo nhóm trong bài (chỉ Shop/Admin nhận) */
  item_group_prices?: Record<string, number>;
  /** Giá gốc riêng của mặt hàng trong bài (null = giá chuẩn) */
  item_list_price?: number | null;
  product_base_price?: number;
  /** Nguồn của giá cuối: BASE / GROUP / POST_SALE / PRODUCT_SALE */
  price_source?: 'BASE' | 'GROUP' | 'POST_SALE' | 'PRODUCT_SALE';
  /** % chiết khấu nhóm của người xem trong bài */
  group_discount?: number;
  post_sale_price?: number | null;
  quantity_limit?: number | null;
  sold_quantity?: number;
  remaining_quantity?: number | null;
  stock_quantity?: number;
  /** Giá theo nhóm của người xem trước Sale; effective_price = giá cuối cùng */
  list_price?: number;
  on_sale?: boolean;
  sale_percent?: number;
  /** Sale programme of the product itself */
  product_sale_price?: number | null;
  sale_start_at?: string | null;
  sale_end_at?: string | null;
  sale_status?: 'NONE' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED';
};

export type PostComment = {
  id: number;
  post_id: number;
  user_id: number;
  author_name: string;
  author_role?: string | null;
  /** Customer group code of a CUSTOMER author. */
  author_group?: string | null;
  author_avatar_url?: string | null;
  content: string;
  created_at: string;
};

export type FeedSidebar = {
  best_sellers: { product_id: number; name: string; unit: string; image_url: string; sold: number }[];
  best_sellers_period: 'TODAY' | '7_DAYS';
  deals_for_you: { post_id: number; post_title: string; product_id: number; name: string; unit: string; image_url: string; price: number; base_price: number; saving_percent: number; on_sale: boolean }[];
  top_shops: { shop_id: number; name: string; avatar_url?: string | null; completed_orders: number; rating: number; review_count: number }[];
};

export type Post = {
  id: number;
  author_id: number;
  author_name?: string;
  author_avatar_url?: string | null;
  shop_name?: string;
  title: string;
  content: string;
  post_type: 'PRODUCT_INTRO' | 'DAILY_SPECIAL' | 'PROMOTION';
  product_id?: number | null;
  product_ids?: number[];
  products_info?: PostProductInfo[];
  product_name?: string;
  image_urls?: string;
  quantity_limit?: number | null;
  target_audience: 'ALL' | 'INDIVIDUAL' | 'GROUP' | 'COLLECTIVE' | 'CUSTOM_GROUP';
  target_customer_group?: string | null;
  /** Bài dành cho nhiều nhóm */
  target_groups?: string[];
  original_price?: number | null;
  sale_price?: number | null;
  effective_price?: number | null;
  group_prices?: string;
  /** Chiết khấu % theo nhóm (khách hàng chỉ nhận nhóm của mình) */
  group_discounts?: Record<string, number>;
  program_status?: 'UPCOMING' | 'ACTIVE' | 'ENDED';
  like_count?: number;
  liked_by_me?: boolean;
  comment_count?: number;
  /** Latest comments, shown directly under the post */
  recent_comments?: PostComment[];
  order_start_at?: string | null;
  order_end_at?: string | null;
  delivery_time_text?: string;
  is_active: boolean;
  created_at: string;
};

export type CustomerGroup = {
  id: number;
  code: string;
  name: string;
  description: string;
  discount_percent: number;
  is_active: boolean;
};

export type VatConfig = {
  id: number;
  tax_name: string;
  rate: number;
  category_id?: number | null;
  is_active: boolean;
  updated_at: string;
};

export type ProductReview = {
  id: number;
  product_id: number;
  user_id: number;
  user_name?: string;
  order_id?: number | null;
  rating: number;
  comment: string;
  images: string;
  shop_reply: string;
  is_hidden: boolean;
  created_at: string;
};

export type ShipperReview = {
  id: number;
  shipper_id: number;
  shipper_name?: string;
  user_id: number;
  customer_name?: string;
  order_id: number;
  rating: number;
  attitude_rating: number;
  speed_rating: number;
  comment: string;
  created_at: string;
};

export type ChatMessage = {
  id: number;
  sender_id: number;
  sender_name?: string;
  sender_role?: string;
  receiver_id?: number | null;
  order_id?: number | null;
  content: string;
  image_url?: string | null;
  is_read: boolean;
  created_at: string;
};

export type Conversation = {
  peer_id: number;
  peer_name: string;
  peer_role: string;
  avatar_url?: string | null;
  last_message: string;
  last_time: string;
  unread: number;
  order_id?: number | null;
};

export type ChatUser = {
  id: number;
  full_name: string;
  shop_name?: string | null;
  role: UserRole;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
};

export type FinancialSummary = {
  total_users: number;
  total_shops: number;
  total_products: number;
  total_orders: number;
  delivery_success_rate: number;
  total_revenue: number;
  total_subtotal: number;
  total_vat: number;
  total_delivery_fee: number;
  total_paid: number;
  total_debt: number;
  total_collected_by_shipper: number;
  status_distribution: Record<string, number>;
  orders_by_date: Array<{ date: string; revenue: number; orders: number }>;
  shop_breakdown: Array<{ shop_id: number; shop_name: string; total_orders: number; revenue: number }>;
  group_breakdown: Array<{ group: string; orders: number; revenue: number }>;
};
