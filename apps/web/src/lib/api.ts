/** REST client for API_DB_DOCUMENTATION.md (Bearer JWT). */
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
    try { const body = await response.json(); message = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map((item: { loc?: unknown[]; msg?: string }) => `${item.loc?.join('.') || ''}: ${item.msg || ''}`).join('; ') : body.message || message; } catch { /* use default message */ }
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
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
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
  requests: '/product-requests', conversations: '/conversations', customers: '/admin/users',
  reports: '/admin/reports/summary', auditLogs: '/admin/audit-logs', deliverySlots: '/delivery-slots',
};

export type CustomerGroup = 'STUDENT' | 'WORKING';
export type UserOut = { id: number; email: string; full_name: string; phone?: string | null; role: string; customer_group: CustomerGroup; is_active: boolean };
export type AddressIn = { label?: string; recipient: string; phone: string; line1: string; ward?: string; district?: string; city: string; is_default?: boolean };
export type ProductIn = { name: string; description?: string; category_id?: number | null; unit?: string; image_url?: string | null; base_price: number };
export type BatchOut = { id: number; product_id: number; batch_date: string; initial_quantity: number | string; approved_quantity: number | string; is_open: boolean };
export type OrderStatus = 'APPROVED' | 'REJECTED' | 'PREPARING' | 'DELIVERING' | 'COMPLETED' | 'CANCELLED';
export type OrderCreateIn = { items: { batch_id: number; quantity: number }[]; delivery_type: string; delivery_address?: string; delivery_slot_id?: number | null; note?: string };
const query = (values: Record<string, string | number | boolean | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined) params.set(key, String(value)); });
  return params.size ? `?${params}` : '';
};
/** Operations whose response schemas are not specified use a caller-selected result type. */
export const freshflow = {
  health: () => api.get<unknown>('/health'),
  register: (body: { email: string; full_name: string; password: string; phone?: string; customer_group?: CustomerGroup }) => api.post<UserOut>('/auth/register', body),
  login: async (username: string, password: string) => {
    authToken.clear();
    const token = await api.post<{ access_token: string; token_type: string }>('/auth/login', { username, password });
    if (!token.access_token || typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer') throw new ApiError('Phản hồi đăng nhập không có Bearer token hợp lệ.');
    authToken.set(token.access_token);
    try { return await api.get<UserOut>('/auth/me'); } catch (error) { authToken.clear(); throw error; }
  },
  me: () => api.get<UserOut>('/auth/me'),
  users: (search?: string) => api.get<UserOut[]>(`/admin/users${query({ search })}`),
  userStatus: (id: number, is_active: boolean) => api.patch<UserOut>(`/admin/users/${id}/status${query({ is_active })}`, undefined),
  addresses: <T>() => api.get<T[]>('/addresses'),
  createAddress: <T>(body: AddressIn) => api.post<T>('/addresses', body),
  updateAddress: <T>(id: number, body: AddressIn) => api.patch<T>(`/addresses/${id}`, body),
  deleteAddress: (id: number) => api.delete<void>(`/addresses/${id}`),
  categories: <T>() => api.get<T[]>('/categories'),
  createCategory: <T>(name: string) => api.post<T>('/admin/categories', { name }),
  products: <T>(category_id?: number) => api.get<T[]>(`/products${query({ category_id })}`),
  catalog: <T>(category_id?: number) => api.get<T[]>(`/catalog/me${query({ category_id })}`),
  createProduct: <T>(body: ProductIn) => api.post<T>('/admin/products', body),
  updateProduct: <T>(id: number, body: Partial<ProductIn>) => api.patch<T>(`/admin/products/${id}`, body),
  deleteProduct: (id: number) => api.delete<void>(`/admin/products/${id}`),
  batches: (id: number) => api.get<BatchOut[]>(`/admin/products/${id}/batches`),
  createBatch: (id: number, body: { batch_date: string; initial_quantity: number; is_open?: boolean }) => api.post<BatchOut>(`/admin/products/${id}/batches`, body),
  price: <T>(id: number, customer_group: CustomerGroup, unit_price: number) => api.put<T>(`/admin/products/${id}/prices/${customer_group}`, { customer_group, unit_price }),
  deliverySlots: <T>() => api.get<T[]>('/delivery-slots'),
  createDeliverySlot: <T>(body: { name: string; customer_group?: CustomerGroup | 'ALL'; fee: number; is_active?: boolean }) => api.post<T>('/admin/delivery-slots', body),
  createOrder: <T>(body: OrderCreateIn) => api.post<T>('/orders', body),
  orders: <T>(status?: string) => api.get<T[]>(`/orders${query({ status })}`),
  order: <T>(id: number) => api.get<T>(`/orders/${id}`),
  orderHistory: <T>(id: number) => api.get<T[]>(`/orders/${id}/history`),
  orderStatus: <T>(id: number, status: OrderStatus, note?: string) => api.patch<T>(`/admin/orders/${id}/status`, { status, note }),
  productRequests: <T>() => api.get<T[]>('/product-requests'),
  createRequest: <T>(product_name: string, description?: string) => api.post<T>('/product-requests', { product_name, description }),
  respondRequest: <T>(id: number, body: { status: 'QUOTED' | 'ACCEPTED' | 'REJECTED' | 'FULFILLED'; admin_response?: string; quoted_price?: number }) => api.patch<T>(`/admin/product-requests/${id}`, body),
  notifications: <T>() => api.get<T[]>('/notifications'),
  readNotification: (id: number) => api.patch<void>(`/notifications/${id}/read`, undefined),
  createConversation: <T>(participant_id?: number) => api.post<T>('/conversations', { participant_id }),
  messages: <T>(id: number) => api.get<T[]>(`/conversations/${id}/messages`),
  sendMessage: <T>(id: number, body: string) => api.post<T>(`/conversations/${id}/messages`, { body }),
  addModerationTerm: <T>(term: string) => api.post<T>(`/admin/moderation/terms${query({ term })}`),
  report: <T>(date_from: string, date_to: string) => api.get<T>(`/admin/reports/summary${query({ date_from, date_to })}`),
  auditLogs: <T>(limit = 100) => api.get<T[]>(`/admin/audit-logs${query({ limit })}`),
};
