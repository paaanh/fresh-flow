/** REST client for FreshFlow API (Bearer JWT). */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '');

export const authToken = {
  get: () => typeof window === 'undefined' ? null : sessionStorage.getItem('freshflow-access-token'),
  set: (token: string) => sessionStorage.setItem('freshflow-access-token', token),
  clear: () => { if (typeof window !== 'undefined') sessionStorage.removeItem('freshflow-access-token'); },
};

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = 'ApiError'; }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = authToken.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, { ...init, headers, credentials: 'omit', cache: 'no-store' });
  } catch {
    throw new ApiError('Không kết nối được máy chủ. Vui lòng kiểm tra backend và thử lại.');
  }
  if (!response.ok) {
    let message = `Yêu cầu thất bại (${response.status}).`;
    try {
      const body = await response.json();
      message = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map((item: { loc?: unknown[]; msg?: string }) => `${item.loc?.join('.') || ''}: ${item.msg || ''}`).join('; ') : body.message || message;
    } catch { /* use default message */ }
    if (response.status === 401 && token && authToken.get() === token) {
      authToken.clear();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('freshflow:unauthorized'));
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};

export type ApiEnvelope<T> = T[] | { items: T[]; total?: number } | { data: T[]; total?: number };
export function unwrapList<T>(payload: ApiEnvelope<T>): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && 'items' in payload && Array.isArray(payload.items)) return payload.items;
  if (payload && 'data' in payload && Array.isArray(payload.data)) return payload.data;
  throw new ApiError('Phản hồi danh sách không đúng định dạng.');
}

export const endpoints = {
  products: '/products', orders: '/orders', categories: '/categories',
  notifications: '/notifications', addresses: '/addresses', profile: '/auth/me',
  requests: '/product-requests', customers: '/admin/users',
  reports: '/admin/reports/summary', auditLogs: '/admin/audit-logs', deliverySlots: '/delivery-slots',
  posts: '/posts', vat: '/admin/vat', customerGroups: '/customer-groups',
  chat: '/chat/messages', reviews: '/admin/reviews', shipperOrders: '/shipper/orders',
};

export type CustomerGroup = 'STUDENT' | 'WORKING' | 'GROUP_A' | 'GROUP_B' | 'COLLECTIVE' | string;
export type UserOut = {
  id: number;
  email: string;
  full_name: string;
  phone?: string | null;
  role: string;
  customer_group: CustomerGroup;
  is_active: boolean;
  is_email_verified?: boolean;
  is_phone_verified?: boolean;
  shop_name?: string | null;
  shop_description?: string;
  shop_address?: string;
  avatar_url?: string | null;
  vehicle_info?: string;
};
export type AddressIn = { label?: string; recipient: string; phone: string; line1: string; ward?: string; district?: string; city: string; is_default?: boolean };
export type ProductIn = { name: string; description?: string; category_id?: number | null; unit?: string; image_url?: string | null; images?: string; attached_services?: string; base_price: number; shop_id?: number | null };
export type BatchOut = { id: number; product_id: number; batch_date: string; initial_quantity: number | string; approved_quantity: number | string; is_open: boolean };
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'APPROVED' | 'REJECTED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'PICKED_UP' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED';
export type OrderCreateIn = {
  items: { batch_id: number; quantity: number }[];
  delivery_type: string;
  delivery_address?: string;
  recipient_name?: string;
  recipient_phone?: string;
  expected_delivery_time?: string;
  delivery_slot_id?: number | null;
  payment_method?: string;
  note?: string;
};

const query = (values: Record<string, string | number | boolean | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined) params.set(key, String(value)); });
  return params.size ? `?${params}` : '';
};

export const freshflow = {
  health: () => api.get<unknown>('/health'),
  register: (body: { email: string; full_name: string; password: string; phone?: string; customer_group?: CustomerGroup; role?: string; otp_code?: string }) => api.post<UserOut>('/auth/register', body),
  requestOtp: (target: string, purpose = 'register') => api.post<{ success: boolean; message: string; otp_code?: string; expires_in?: number }>('/auth/request-otp', { target, purpose }),
  verifyOtp: (target: string, code: string, purpose = 'register') => api.post<{ success: boolean; message: string; verified: boolean }>('/auth/verify-otp', { target, code, purpose }),
  resetPassword: (body: { target: string; code: string; new_password: string }) => api.post<{ success: boolean; message: string }>('/auth/reset-password', body),
  login: async (username: string, password: string) => {
    authToken.clear();
    const token = await api.post<{ access_token: string; token_type: string }>('/auth/login', { username, password });
    if (!token.access_token || typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer') throw new ApiError('Phản hồi đăng nhập không có Bearer token hợp lệ.');
    authToken.set(token.access_token);
    try { return await api.get<UserOut>('/auth/me'); } catch (error) { authToken.clear(); throw error; }
  },
  me: () => api.get<UserOut>('/auth/me'),
  updateProfile: (body: { full_name?: string; phone?: string | null; shop_name?: string | null; shop_description?: string; shop_address?: string; vehicle_info?: string }) => api.patch<UserOut>('/users/profile', body),
  users: (search?: string) => api.get<UserOut[]>(`/admin/users${query({ search })}`),
  userStatus: (id: number, is_active: boolean) => api.patch<UserOut>(`/admin/users/${id}/status${query({ is_active })}`, undefined),
  adminUpdateUser: (id: number, body: Record<string, unknown>) => api.patch<UserOut>(`/admin/users/${id}`, body),
  shippers: () => api.get<UserOut[]>('/shippers'),
  shops: () => api.get<UserOut[]>('/shops'),

  // Addresses
  addresses: <T>() => api.get<T[]>('/addresses'),
  createAddress: <T>(body: AddressIn) => api.post<T>('/addresses', body),
  updateAddress: <T>(id: number, body: AddressIn) => api.patch<T>(`/addresses/${id}`, body),
  deleteAddress: (id: number) => api.delete<void>(`/addresses/${id}`),

  // Categories & Products
  categories: <T>() => api.get<T[]>('/categories'),
  createCategory: <T>(name: string, description?: string) => api.post<T>('/admin/categories', description ? { name, description } : { name }),
  products: <T>(category_id?: number, shop_id?: number) => api.get<T[]>(`/products${query({ category_id, shop_id })}`),
  catalog: <T>(category_id?: number, shop_id?: number) => api.get<T[]>(`/catalog/me${query({ category_id, shop_id })}`),
  createProduct: <T>(body: ProductIn) => api.post<T>('/admin/products', body),
  uploadImage: <T>(form: FormData) => api.upload<T>('/admin/products/images', form),
  updateProduct: <T>(id: number, body: Partial<ProductIn>) => api.patch<T>(`/admin/products/${id}`, body),
  deleteProduct: (id: number) => api.delete<void>(`/admin/products/${id}`),
  batches: (id: number) => api.get<BatchOut[]>(`/admin/products/${id}/batches`),
  createBatch: (id: number, body: { batch_date: string; initial_quantity: number; is_open?: boolean }) => api.post<BatchOut>(`/admin/products/${id}/batches`, body),
  removeStock: (id: number, quantity: number) => api.post<{ product_id: number; removed_quantity: number; available_quantity: number }>(`/admin/products/${id}/adjustments`, { quantity }),
  price: <T>(id: number, customer_group: CustomerGroup, unit_price: number) => api.put<T>(`/admin/products/${id}/prices/${customer_group}`, { customer_group, unit_price }),
  deliverySlots: <T>() => api.get<T[]>('/delivery-slots'),
  createDeliverySlot: <T>(body: { name: string; customer_group?: CustomerGroup | 'ALL'; fee: number; is_active?: boolean }) => api.post<T>('/admin/delivery-slots', body),
  deleteDeliverySlot: <T>(id: number) => api.delete<T>(`/admin/delivery-slots/${id}`),

  // Orders
  createOrder: <T>(body: OrderCreateIn) => api.post<T>('/orders', body),
  orders: <T>(status?: string, search?: string, shop_id?: number, shipper_id?: number) => api.get<T[]>(`/orders${query({ status, search, shop_id, shipper_id })}`),
  order: <T>(id: number) => api.get<T>(`/orders/${id}`),
  orderHistory: <T>(id: number) => api.get<T[]>(`/orders/${id}/history`),
  orderStatus: <T>(id: number, status: OrderStatus, note?: string) => api.patch<T>(`/admin/orders/${id}/status`, { status, note }),
  assignShipper: <T>(id: number, shipper_id: number) => api.patch<T>(`/orders/${id}/assign-shipper`, { shipper_id }),
  updateOrderPayment: <T>(id: number, body: { paid_amount: number; payment_status: string; cash_collected?: number; note?: string }) => api.patch<T>(`/orders/${id}/payment`, body),

  // Shipper dedicated APIs
  shipperOrders: <T>(status?: string, available_only?: boolean) => api.get<T[]>(`/shipper/orders${query({ status, available_only })}`),
  claimShipperOrder: <T>(id: number) => api.patch<T>(`/shipper/orders/${id}/claim`),
  shipperPickup: <T>(id: number, note?: string) => api.patch<T>(`/shipper/orders/${id}/pickup${query({ note })}`),
  shipperDelivering: <T>(id: number, note?: string) => api.patch<T>(`/shipper/orders/${id}/delivering${query({ note })}`),
  shipperComplete: <T>(id: number, paid_amount?: number, note?: string) => api.patch<T>(`/shipper/orders/${id}/complete${query({ paid_amount, note })}`),
  shipperSummary: <T>() => api.get<T>('/shipper/summary'),

  // Posts & Newfeed
  posts: <T>(category_id?: number, shop_id?: number, post_type?: string) => api.get<T[]>(`/posts${query({ category_id, shop_id, post_type })}`),
  createPost: <T>(body: unknown) => api.post<T>('/posts', body),
  updatePost: <T>(id: number, body: unknown) => api.patch<T>(`/posts/${id}`, body),
  deletePost: (id: number) => api.delete<void>(`/posts/${id}`),

  // VAT configs
  vatConfigs: <T>() => api.get<T[]>('/vat/configs').catch(() => api.get<T[]>('/admin/vat')),
  adminVatConfigs: <T>() => api.get<T[]>('/admin/vat'),
  vatHistory: <T>() => api.get<T[]>('/admin/vat/history'),
  updateVatConfig: <T>(id: number, body: { tax_name: string; rate: number; category_id?: number | null; note?: string }) => api.put<T>(`/admin/vat/${id}`, body),

  // Customer Groups
  customerGroups: <T>() => api.get<T[]>('/customer-groups'),
  createCustomerGroup: <T>(body: unknown) => api.post<T>('/admin/customer-groups', body),
  updateCustomerGroup: <T>(id: number, body: unknown) => api.patch<T>(`/admin/customer-groups/${id}`, body),

  // Reviews
  productReviews: <T>(productId: number) => api.get<T[]>(`/products/${productId}/reviews`),
  orderReviews: <T>(orderId: number) => api.get<T>(`/orders/${orderId}/reviews`),
  shopReviews: <T>() => api.get<T[]>('/shop/reviews'),
  createProductReview: <T>(productId: number, body: unknown) => api.post<T>(`/products/${productId}/reviews`, body),
  replyReview: <T>(reviewId: number, reply: string) => api.post<T>(`/reviews/${reviewId}/reply`, { reply }),
  reviewShipper: <T>(orderId: number, body: unknown) => api.post<T>(`/orders/${orderId}/shipper-review`, body),
  adminReviews: <T>() => api.get<T>('/admin/reviews'),
  toggleHideReview: (reviewId: number, hidden = true) => api.patch<{ id: number; is_hidden: boolean }>(`/admin/reviews/${reviewId}/hide${query({ hidden })}`),

  // Chat Realtime
  chatConversations: <T>() => api.get<T[]>('/chat/conversations'),
  chatUsers: <T>(search?: string, role?: string) => api.get<T[]>(`/chat/users${query({ query: search, role })}`),
  chatMessages: <T>(peer_id?: number, order_id?: number) => api.get<T[]>(`/chat/messages${query({ peer_id, order_id })}`),
  sendChatMessage: <T>(body: { receiver_id?: number | null; order_id?: number | null; content: string; image_url?: string | null }) => api.post<T>('/chat/messages', body),

  // Product requests & Notifications
  productRequests: <T>() => api.get<T[]>('/product-requests'),
  createRequest: <T>(product_name: string, description?: string) => api.post<T>('/product-requests', { product_name, description }),
  respondRequest: <T>(id: number, body: { status: 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'FULFILLED'; admin_response?: string; quoted_price?: number }) => api.patch<T>(`/admin/product-requests/${id}`, body),
  notifications: <T>() => api.get<T[]>('/notifications'),
  readNotification: (id: number) => api.patch<void>(`/notifications/${id}/read`, undefined),
  broadcastNotification: <T>(body: { title: string; body: string; target_role?: string | null }) => api.post<T>('/admin/notifications/broadcast', body),
  moderationTerms: <T>() => api.get<T[]>('/admin/moderation/terms'),
  addModerationTerm: <T>(term: string) => api.post<T>(`/admin/moderation/terms${query({ term })}`),
  deleteModerationTerm: (id: number) => api.delete<void>(`/admin/moderation/terms/${id}`),
  moderationViolations: <T>() => api.get<T[]>('/admin/moderation/violations'),

  // Financial Dashboard Reports
  report: <T>(date_from: string, date_to: string) => api.get<T>(`/admin/reports/summary${query({ date_from, date_to })}`),
  dashboardFinancialSummary: <T>(days = 30) => api.get<T>(`/admin/reports/dashboard${query({ days })}`),
  shopFinancialSummary: <T>(days = 30) => api.get<T>(`/shop/reports/dashboard${query({ days })}`),
  auditLogs: <T>(limit = 100) => api.get<T[]>(`/admin/audit-logs${query({ limit })}`),
};
