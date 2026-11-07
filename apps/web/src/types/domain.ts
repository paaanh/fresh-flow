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
};

export type Order = {
  apiId?: number;
  id: string;
  customer: string;
  customer_name?: string;
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
  note?: string;
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
};

export type Post = {
  id: number;
  author_id: number;
  author_name?: string;
  shop_name?: string;
  title: string;
  content: string;
  post_type: 'PRODUCT_INTRO' | 'DAILY_SPECIAL' | 'PROMOTION';
  product_id?: number | null;
  product_name?: string;
  image_urls?: string;
  quantity_limit?: number | null;
  target_audience: 'ALL' | 'INDIVIDUAL' | 'GROUP' | 'COLLECTIVE' | 'CUSTOM_GROUP';
  target_customer_group?: string | null;
  sale_price?: number | null;
  effective_price?: number | null;
  group_prices?: string;
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
