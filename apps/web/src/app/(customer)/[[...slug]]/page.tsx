'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowRight,
  faBell,
  faCheck,
  faCircleQuestion,
  faComments,
  faMotorcycle,
  faPlus,
  faRightFromBracket,
  faSeedling,
  faShoppingCart,
  faStar,
  faStore,
  faUser,
  faUserGroup,
} from '@fortawesome/free-solid-svg-icons';

import { Badge, Button } from '@/features/customer/pages/shared-ui';
import { ProductDetail, ProductGrid, ProductsPanel } from '@/features/customer/pages/catalog';
import { OrderDetailView, OrderTable, OrdersView } from '@/features/customer/pages/orders';
import { RequestsView } from '@/features/customer/pages/requests';
import { Help, GuidePage } from '@/features/customer/pages/help';
import { Cart } from '@/features/customer/pages/cart';
import { CheckoutPanel } from '@/features/customer/pages/checkout';
import ProductPhoto from '@/components/product-photo';
import GlobalSearch from '@/components/global-search';
import { normalizeSearch } from '@/lib/search';
import { api, unwrapList, freshflow, authToken } from '@/lib/api';
import { allocateOrderItems } from '@/lib/order-payload';
import { ApiProfile, ApiCheckout, ApiDashboard, type CheckoutDetails } from '@/features/api-panels';
import { RealtimeClient } from '@/lib/realtime';
import { usePersistentState } from '@/hooks/use-persistent-state';
import type {
  Order,
  Product,
  ProductRequest,
  Post,
  VatConfig,
  ProductReview,
  ChatMessage,
  Conversation,
  FinancialSummary,
  User as DomainUser,
} from '@/types/domain';
import HomePage from '@/features/home-page';
import { InventoryView, Deliveries, CustomersView, ReportsPanel } from '@/features/admin/pages';
import { adminSections, customerSections, defaultFinancialSummary, money, normalizeOrder, normalizeProduct, normalizeRequest, shipperSections, shopSections, titleMap, toApiOrderStatus } from '@/features/customer/page-model';

// Specialized module components
import Newfeed from '@/components/newfeed';
import AdminDashboardView from '@/components/admin-dashboard-view';
import ShopPortalView from '@/components/shop-portal-view';
import ShipperPortalView from '@/components/shipper-portal-view';
import ChatModal from '@/components/chat-modal';
import ReviewModal from '@/components/reviews-modal';
import ProductEditorModal, { type ProductDraft } from '@/components/product-editor-modal';

export default function FreshFlow() {
  const pathname = usePathname() || '/dashboard';
  const router = useRouter();
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const page =
    isAdminRoute && pathname === '/admin'
      ? 'dashboard'
      : pathname.split('/').filter(Boolean).pop() || 'dashboard';

  const [role, setRole] = usePersistentState<'admin' | 'shop' | 'customer' | 'shipper'>('freshflow-role', 'customer');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [vatConfigs, setVatConfigs] = useState<VatConfig[]>([]);
  const [vatHistory, setVatHistory] = useState<any[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [shippers, setShippers] = useState<DomainUser[]>([]);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary>(defaultFinancialSummary);

  const [cart, setCart] = usePersistentState<Record<number, number>>('freshflow-cart', {});
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const [toast, setToast] = useState('');
  const [productEditorOpen, setProductEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [, setModal] = useState('');
  const [activeTab, setActiveTab] = useState('Tất cả');
  const [notifications, setNotifications] = useState<{ id: number; title: string; body: string; event_type: string; is_read: boolean; created_at?: string }[]>([]);
  const [currentUser, setCurrentUser] = useState<DomainUser | undefined>();
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [apiState, setApiState] = useState<'checking' | 'live'>('checking');
  const [socketState, setSocketState] = useState<'connecting' | 'connected' | 'offline'>('offline');

  // Realtime Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activePeerId, setActivePeerId] = useState<number | undefined>();
  const activePeerRef = useRef<number | undefined>(undefined);

  // Review Modal state
  const [reviewModalData, setReviewModalData] = useState<{
    isOpen: boolean;
    type: 'product' | 'shipper';
    targetId: number;
    title: string;
  }>({ isOpen: false, type: 'product', targetId: 0, title: '' });

  const detailId = pathname.match(/^\/(?:admin\/)?products\/([^/]+)$/)?.[1];
  const detailProduct = products.find(product => String(product.id) === detailId);
  const orderDetailId = pathname.match(/^\/(?:admin\/)?orders\/([^/]+)$/)?.[1];
  const detailOrder = orders.find(order => order.id === decodeURIComponent(orderDetailId || ''));
  const reviewableCompletedOrder = orders.find(order => ['Hoàn thành', 'COMPLETED'].includes(order.status) && order.lines?.some(line => line.productId));

  const admin = role === 'admin';
  const shop = role === 'shop';
  const shipper = role === 'shipper';

  const title =
    detailProduct?.name ||
    (detailOrder ? `Đơn ${detailOrder.id}` : undefined) ||
    titleMap[page] ||
    'Tổng quan';

  const links = admin ? adminSections : shop ? shopSections : shipper ? shipperSections : customerSections;
  const adminOnly = ['inventory', 'deliveries', 'customers', 'reports', 'moderation', 'pricing', 'audit-logs', 'settings'];

  useEffect(() => {
    if (!authToken.get()) {
      setRole('customer');
      if (pathname !== '/') {
        setApiState('checking');
        router.replace('/login');
        return;
      }
      let alive = true;
      setApiState('checking');
      setLoadError('');
      Promise.all([freshflow.products<any>(), freshflow.categories<any>()])
        .then(([productsResult, categoriesResult]) => {
          if (!alive) return;
          const categories = unwrapList<any>(categoriesResult);
          setCategories(categories.map((category: any) => ({ id: Number(category.id), name: category.name })));
          setProducts(unwrapList<any>(productsResult).map(product => normalizeProduct({
            ...product,
            category_name: categories.find(category => category.id === product.category_id)?.name,
          })));
          setPosts([]);
          setApiState('live');
        })
        .catch(error => {
          if (!alive) return;
          setLoadError(error instanceof Error ? error.message : 'Không tải được sản phẩm.');
          setApiState('live');
        });
      return () => { alive = false; };
    }

    let alive = true;
    let realtime: RealtimeClient | undefined;
    setApiState('checking');
    setLoadError('');

    const unauthorized = () => {
      if (alive) {
        realtime?.close();
        setApiState('checking');
        router.replace('/login');
      }
    };
    window.addEventListener('freshflow:unauthorized', unauthorized);

    async function start() {
      try {
        const user = await freshflow.me();
        if (!alive) return;
        setCurrentUser(user as any);

        const normalizedRole = user.role.toLowerCase() as 'admin' | 'shop' | 'customer' | 'shipper';
        setRole(normalizedRole);

        const refreshSnapshot = async () => {
          const results = await Promise.allSettled([
            freshflow.products<any>(),
            normalizedRole === 'shipper'
              ? Promise.all([freshflow.shipperOrders<any>(undefined, false), freshflow.shipperOrders<any>(undefined, true)]).then(([assigned, available]) => [...assigned, ...available])
              : freshflow.orders<any>(),
            freshflow.productRequests<any>(),
            freshflow.notifications<any>(),
            freshflow.categories<any>(),
            freshflow.posts<any>(),
            freshflow.vatConfigs<any>(),
            freshflow.vatHistory<any>(),
            freshflow.dashboardFinancialSummary<any>(),
            freshflow.shippers(),
            normalizedRole === 'shop' ? freshflow.shopReviews<any>() : Promise.resolve([]),
          ]);

          if (!alive || !authToken.get()) return;

          const [
            prodsRes,
            ordersRes,
            reqsRes,
            noticesRes,
            catsRes,
            postsRes,
            vatRes,
            vatHistRes,
            finRes,
            shippersRes,
            reviewsRes,
          ] = results;

          if (prodsRes.status === 'fulfilled') {
            const categories = catsRes.status === 'fulfilled' ? unwrapList<any>(catsRes.value) : [];
            setCategories(categories.map((category: any) => ({ id: Number(category.id), name: category.name })));
            setProducts(
              unwrapList<any>(prodsRes.value).map(p =>
                normalizeProduct({
                  ...p,
                  category_name: categories.find(c => c.id === p.category_id)?.name,
                })
              )
            );
          }
          if (ordersRes.status === 'fulfilled') {
            setOrders(unwrapList<any>(ordersRes.value).map(normalizeOrder));
          }
          if (reqsRes.status === 'fulfilled') {
            setRequests(unwrapList<any>(reqsRes.value).map(normalizeRequest));
          }
          if (noticesRes.status === 'fulfilled') {
            const notices = unwrapList<any>(noticesRes.value);
            setNotifications(notices);
          }
          if (postsRes.status === 'fulfilled') {
            setPosts(unwrapList<any>(postsRes.value));
          }
          if (vatRes.status === 'fulfilled') {
            setVatConfigs(unwrapList<any>(vatRes.value));
          }
          if (vatHistRes.status === 'fulfilled') {
            setVatHistory(unwrapList<any>(vatHistRes.value));
          }
          if (finRes.status === 'fulfilled') {
            setFinancialSummary(finRes.value);
          }
          if (shippersRes.status === 'fulfilled') {
            setShippers(unwrapList<any>(shippersRes.value));
          }
          if (reviewsRes.status === 'fulfilled') {
            setReviews(unwrapList<any>(reviewsRes.value));
          }

          setApiState('live');
        };

        realtime = new RealtimeClient(
          event => {
            if (
              [
                'inventory.updated',
                'order.status_changed',
                'notification.created',
                'order.assigned',
                'order.new',
                'chat.message',
              ].includes(event.type)
            ) {
              void refreshSnapshot();
              const chatData = event.data as any;
              if (event.type === 'chat.message' && chatData?.content) {
                setToast(`Tin nhắn mới từ ${chatData.sender_name || 'Hệ thống'}: "${chatData.content}"`);
                if (Number(chatData.sender_id) === activePeerRef.current) {
                  setChatMessages(current => current.some(message => message.id === chatData.id) ? current : [...current, {
                    id: Number(chatData.id), sender_id: Number(chatData.sender_id), sender_name: chatData.sender_name,
                    content: chatData.content, receiver_id: user.id, is_read: false, created_at: chatData.created_at,
                  }]);
                }
              }
            }
          },
          state => {
            if (alive) {
              setSocketState(state);
              if (state === 'connected') void refreshSnapshot();
            }
          }
        );

        await refreshSnapshot();
        if (alive && authToken.get()) realtime.connect();
      } catch (error) {
        if (alive && authToken.get()) {
          setLoadError(error instanceof Error ? error.message : 'Không tải được tài khoản.');
          setApiState('live');
        }
      }
    }

    void start();
    return () => {
      alive = false;
      window.removeEventListener('freshflow:unauthorized', unauthorized);
      realtime?.close();
    };
  }, [pathname, reload, router]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const filtered = useMemo(
    () =>
      products.filter(
        p => (category === 'Tất cả' || p.category === category) && normalizeSearch(p.name).includes(normalizeSearch(query))
      ),
    [products, category, query]
  );

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = products.reduce((sum, p) => sum + (cart[p.id] || 0) * p.price, 0);
  const addCart = (id: number) => {
    setCart(v => ({ ...v, [id]: (v[id] || 0) + 1 }));
    setToast('Đã thêm sản phẩm vào giỏ hàng');
  };

  const changeOrderStatus = async (id: string, status: string, note?: string) => {
    if (apiState === 'live') {
      try {
        const target = orders.find(order => order.id === id);
        if (!target?.apiId) throw new Error('Đơn hàng chưa có ID backend.');
        const response = await api.patch<any>(`/orders/${target.apiId}/status`, {
          status: toApiOrderStatus(status),
          note,
        });
        setOrders(current => current.map(order => (order.id === id ? normalizeOrder(response) : order)));
        setToast(`Đã cập nhật đơn ${id} thành "${status}"`);
        return true;
      } catch (error) {
        setToast(error instanceof Error ? error.message : 'Không thể cập nhật đơn hàng');
        return false;
      }
    }
    setOrders(v => v.map(o => (o.id === id ? { ...o, status } : o)));
    setToast(`Đã cập nhật đơn ${id} thành "${status}"`);
    return true;
  };

  const adjustInventory = async (id: number, delta: number) => {
    const product = products.find(item => item.id === id);
    if (!product || !Number.isFinite(delta) || delta === 0 || product.available + delta < 0) return false;
    if (apiState === 'live') {
      try {
        if (delta < 0) await freshflow.removeStock(id, -delta);
        else
          await freshflow.createBatch(id, {
            batch_date: new Date().toISOString(),
            initial_quantity: delta,
            is_open: true,
          });
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Không thể điều chỉnh tồn kho');
        return false;
      }
    }
    setProducts(current =>
      current.map(p => (p.id === id ? { ...p, available: Math.max(0, p.available + delta) } : p))
    );
    notify('Đã cập nhật số lượng tồn kho.');
    return true;
  };

  const updateRequest = async (id: number, status: string) => {
    if (apiState === 'live') {
      try {
        await api.patch(`/admin/product-requests/${id}`, {
          status: status === 'Đã báo giá' ? 'QUOTED' : status,
        });
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Không cập nhật được yêu cầu');
        return;
      }
    }
    setRequests(current => current.map(r => (r.id === id ? { ...r, status } : r)));
    notify('Đã cập nhật yêu cầu mặt hàng.');
  };

  const saveProduct = async (draft: ProductDraft, existing?: Product) => {
    if (apiState !== 'live') {
      notify('Mất kết nối máy chủ. Sản phẩm chưa được lưu.');
      return false;
    }
    const categoryId = categories.find(category => category.name === draft.category)?.id;
    if (!categoryId) {
      notify('Danh mục này chưa tồn tại. Hãy chọn một danh mục có sẵn.');
      return false;
    }
    try {
      const payload = { name: draft.name.trim(), description: draft.description.trim(), category_id: categoryId, unit: draft.unit.trim(), base_price: draft.price, image_url: draft.image_url || null };
      if (existing) {
        const updated = await freshflow.updateProduct<any>(existing.id, payload);
        setProducts(current => current.map(item => item.id === existing.id ? normalizeProduct({ ...updated, category_name: draft.category }) : item));
        notify('Đã cập nhật mặt hàng.');
      } else {
        const created = await freshflow.createProduct<any>({ ...payload, shop_id: shop ? currentUser?.id : undefined });
        if (draft.stock > 0) await freshflow.createBatch(created.id, { batch_date: new Date().toISOString(), initial_quantity: draft.stock, is_open: true });
        setProducts(current => [normalizeProduct({ ...created, category_name: draft.category, available_quantity: draft.stock }), ...current]);
        notify('Đã thêm mặt hàng vào cửa hàng.');
      }
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không lưu được mặt hàng.');
      return false;
    }
  };

  const saveProductInline = async (id: number, changes: Partial<Product>) => {
    const existing = products.find(product => product.id === id);
    if (!existing) return false;
    return saveProduct({
      name: changes.name ?? existing.name,
      description: existing.description || '',
      category: changes.category ?? existing.category,
      unit: changes.unit ?? existing.unit,
      price: changes.price ?? existing.price,
      stock: existing.available,
      image_url: existing.image || '',
    }, existing);
  };

  const deleteProduct = async (id: number) => {
    if (apiState === 'live') {
      try {
        await api.delete(`/admin/products/${id}`);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Không xóa được sản phẩm');
        return;
      }
    }
    setProducts(current => current.filter(p => p.id !== id));
    notify('Đã xóa sản phẩm.');
  };

  const markNotificationRead = async (id: number) => {
    try {
      await freshflow.readNotification(id);
      setNotifications(current => current.map(item => item.id === id ? { ...item, is_read: true } : item));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Kh?ng c?p nh?t ???c th?ng b?o.');
    }
  };

  const clearNotifications = async () => {
    if (apiState === 'live') {
      try {
        const notices = await freshflow.notifications<{ id: number; is_read: boolean }>();
        await Promise.all(notices.filter(item => !item.is_read).map(item => freshflow.readNotification(item.id)));
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Không thể cập nhật thông báo');
        return;
      }
    }
    setNotifications(current => current.map(item => ({ ...item, is_read: true })));
    notify('Đã đánh dấu tất cả thông báo là đã đọc.');
  };

  const placeOrder = async (details: CheckoutDetails): Promise<boolean> => {
    if (!cartCount) {
      notify('Giỏ hàng đang trống');
      return false;
    }
    if (apiState !== 'live' || !authToken.get()) {
      sessionStorage.setItem('freshflow-after-login', '/checkout');
      notify('Đăng nhập để tiếp tục tạo đơn hàng.');
      router.push('/login');
      return false;
    }

    if (apiState === 'live') {
      try {
        const catalog = await freshflow.catalog<any>();
        const items = allocateOrderItems(catalog, cart);
        const pickup = details.delivery === 'Điểm giao tập trung';
        const addresses = pickup ? [] : await freshflow.addresses<any>();
        const address = addresses.find(item => Number(item.id) === details.addressId);
        if (!pickup && !address) throw new Error('Vui lòng chọn địa chỉ giao hàng hợp lệ.');

        const created = await freshflow.createOrder<any>({
          items,
          delivery_type: pickup ? 'PICKUP' : 'HOME',
          delivery_address: address
            ? [address.line1, address.ward, address.district, address.city].filter(Boolean).join(', ')
            : '',
          recipient_name: address?.recipient || currentUser?.full_name || '',
          recipient_phone: address?.phone || currentUser?.phone || '',
          delivery_slot_id: details.deliverySlotId ?? null,
          payment_method: details.paymentMethod || 'COD',
          note: details.note,
        });

        setOrders(current => [normalizeOrder(created), ...current]);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Không thể gửi đơn hàng');
        return false;
      }
    }

    setCart({});
    router.push('/orders');
    setToast('Đã gửi đơn hàng thành công! Đang chờ xác nhận.');
    return true;
  };

  const handleCreatePost = async (postData: any) => {
    try {
      const created = await freshflow.createPost<Post>(postData);
      setPosts(current => [created, ...current]);
      notify('Đã đăng bài quảng bá lên Newfeed thành công!');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Không thể đăng bài');
    }
  };

  const handleUpdateVat = async (id: number, rate: number, note: string) => {
    try {
      const updated = await freshflow.updateVatConfig<VatConfig>(id, {
        tax_name: 'VAT',
        rate,
        note,
      });
      setVatConfigs(current => current.map(v => (v.id === id ? updated : v)));
      const history = await freshflow.vatHistory<any>();
      setVatHistory(unwrapList<any>(history));
      notify(`Đã cập nhật thuế suất VAT thành ${rate * 100}%`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Lỗi cập nhật VAT');
    }
  };

  const handleAssignShipper = async (orderApiId: number, shipperId: number) => {
    try {
      const updated = await freshflow.assignShipper<any>(orderApiId, shipperId);
      setOrders(current => current.map(o => (o.apiId === orderApiId ? normalizeOrder(updated) : o)));
      notify('Đã phân công Shipper giao đơn hàng.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Lỗi phân công');
    }
  };

  const handleReplyReview = async (reviewId: number, reply: string) => {
    try {
      const updated = await freshflow.replyReview<ProductReview>(reviewId, reply);
      setReviews(current => current.map(r => (r.id === reviewId ? updated : r)));
      notify('Đã gửi phản hồi đánh giá.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Lỗi phản hồi');
    }
  };

  // Shipper actions
  const handleShipperClaim = async (orderId: number) => {
    try {
      const updated = await freshflow.claimShipperOrder<any>(orderId);
      setOrders(current => current.map(o => (o.apiId === orderId ? normalizeOrder(updated) : o)));
      notify('Đã nhận giao đơn hàng!');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Lỗi nhận đơn');
    }
  };

  const handleShipperPickup = async (orderId: number) => {
    try {
      const updated = await freshflow.shipperPickup<any>(orderId);
      setOrders(current => current.map(o => (o.apiId === orderId ? normalizeOrder(updated) : o)));
      notify('Đã xác nhận lấy hàng từ Shop.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Lỗi cập nhật');
    }
  };

  const handleShipperDelivering = async (orderId: number) => {
    try {
      const updated = await freshflow.shipperDelivering<any>(orderId);
      setOrders(current => current.map(o => (o.apiId === orderId ? normalizeOrder(updated) : o)));
      notify('Bắt đầu giao đơn hàng.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Lỗi cập nhật');
    }
  };

  const handleShipperComplete = async (orderId: number, paidAmount: number) => {
    try {
      const updated = await freshflow.shipperComplete<any>(orderId, paidAmount);
      setOrders(current => current.map(o => (o.apiId === orderId ? normalizeOrder(updated) : o)));
      notify(`Giao thành công! Đã thu COD: ${money(paidAmount)}`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Lỗi hoàn tất');
    }
  };

  // Chat actions
  const openChatWith = async (peerId?: number) => {
    setIsChatOpen(true);
    if (peerId) {
      setActivePeerId(peerId);
      activePeerRef.current = peerId;
    }
    try {
      const convs = await freshflow.chatConversations<Conversation>();
      const conversationList = unwrapList<Conversation>(convs);
      setConversations(conversationList);
      const targetPeerId = peerId || activePeerRef.current || conversationList[0]?.peer_id;
      if (targetPeerId) {
        setActivePeerId(targetPeerId);
        activePeerRef.current = targetPeerId;
      }
      const msgs = await freshflow.chatMessages<ChatMessage>(targetPeerId);
      setChatMessages(unwrapList<ChatMessage>(msgs));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (page === 'chat') void openChatWith();
  }, [page]);

  const handleSendChatMessage = async (content: string, peerId?: number, orderId?: number) => {
    try {
      const sent = await freshflow.sendChatMessage<ChatMessage>({
        receiver_id: peerId,
        order_id: orderId,
        content,
      });
      setChatMessages(prev => [...prev, sent]);
    } catch (e) {
      notify('Không gửi được tin nhắn.');
    }
  };

  // Review submission
  const handleOpenReview = (targetId: number, title: string, type: 'product' | 'shipper') => {
    setReviewModalData({ isOpen: true, type, targetId, title });
  };

  const handleSubmitReview = async (data: any) => {
    try {
      if (reviewModalData.type === 'product') {
        await freshflow.createProductReview(data.product_id, data);
        notify('Cảm ơn bạn đã đánh giá sản phẩm!');
      } else {
        await freshflow.reviewShipper(data.order_id, data);
        notify('Cảm ơn bạn đã đánh giá tài xế giao hàng!');
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Không gửi được đánh giá');
    }
  };

  const notify = (text: string) => setToast(text);

  const logout = async () => {
    authToken.clear();
    setCart({});
    setProducts([]);
    setOrders([]);
    setRequests([]);
    setNotifications([]);
    setCurrentUser(undefined);
    setRole('customer');
    router.push('/login');
  };


  const link = (href: string, name: string, icon: any, count?: string) => {
    const isCurrent = page === href.split('/').pop();
    return (
      <Link
        key={name}
        href={href}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition ${isCurrent ? 'nav-active font-bold text-[#176b52] bg-[#f0f7f3]' : 'text-[#64736b] hover:bg-slate-50 hover:text-[#233b30]'
          }`}
      >
        <FontAwesomeIcon icon={icon} className="w-4 text-[14px]" />
        <span className="flex-1">{name}</span>
        {count && <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#66736c] shadow-sm">{count}</span>}
      </Link>
    );
  };

  const statusTone = (status: string) =>
    status === 'Hoàn thành'
      ? 'green'
      : status === 'Đang giao'
        ? 'blue'
        : status === 'Từ chối' || status === 'Đã hủy'
          ? 'red'
          : status === 'Chờ xác nhận' || status === 'Chờ duyệt'
            ? 'orange'
            : 'gray';

  if (apiState === 'checking') return <div className="p-8 text-xs font-semibold text-slate-500">Đang khởi tạo kết nối hệ thống FreshFlow…</div>;
  if (loadError && apiState === 'live') {
    return (
      <div className="panel m-8 space-y-4 p-6">
        <h1 className="font-bold">Chưa tải được dữ liệu hệ thống</h1>
        <p role="alert" className="text-sm text-rose-700">{loadError}</p>
        <Button onClick={() => setReload(v => v + 1)}>Thử lại</Button>
        <Button kind="secondary" onClick={logout}>Đăng nhập lại</Button>
      </div>
    );
  }

  if (pathname === '/') return <HomePage products={products} addCart={addCart} money={money} cartCount={cartCount} />;

  return (
    <div className="min-h-screen bg-[#fcfdfc]">
      {/* Desktop Sidebar */}
      <aside className="desktop-sidebar fixed inset-y-0 left-0 z-20 flex w-[260px] flex-col border-r border-[#e8ede8] bg-white px-5 py-6 shadow-sm">
        <Link href={admin ? '/admin/dashboard' : shop ? '/shop' : shipper ? '/shipper' : '/dashboard'} className="mb-7 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#176b52] text-white shadow-sm">
            <FontAwesomeIcon icon={faSeedling} />
          </div>
          <div>
            <div className="text-[18px] font-extrabold tracking-tight text-[#1a2e24]">
              freshflow<span className="text-[#43967b]">.</span>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#97a29b]">Nông sản mỗi ngày</div>
          </div>
        </Link>

        {/* Current Role Card */}
        <div className="mb-5 rounded-2xl bg-[#f6faf7] border border-[#e2ece5] p-3">
          <div className="mb-1.5 text-[9px] font-extrabold uppercase tracking-[.14em] text-[#869b8f]">VAI TRÒ HIỆN TẠI</div>
          <div className="flex w-full items-center gap-2.5 rounded-xl bg-white p-2.5 text-left shadow-sm">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${admin ? 'bg-emerald-100 text-emerald-800' : shop ? 'bg-amber-100 text-amber-800' : shipper ? 'bg-blue-100 text-blue-800' : 'bg-teal-100 text-teal-800'}`}>
              <FontAwesomeIcon icon={admin ? faUserGroup : shop ? faStore : shipper ? faMotorcycle : faUser} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-extrabold text-[#1f2d25] truncate">
                {admin ? 'Quản trị viên (Admin)' : shop ? 'Cửa hàng (Shop)' : shipper ? 'Giao hàng (Shipper)' : 'Khách hàng'}
              </div>
              <div className="text-[10px] text-[#89958e] truncate">
                {currentUser?.full_name || ''}
              </div>
            </div>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="scrollbar-hide flex-1 space-y-5 overflow-y-auto pr-1">
          {links.map(section => (
            <div key={section.label}>
              <div className="mb-2 px-3 text-[9px] font-extrabold tracking-[.16em] text-[#a2aca5]">{section.label}</div>
              <div className="space-y-1">{section.links.map((item: any) => link(item.href, item.name, item.icon, item.count))}</div>
            </div>
          ))}
        </nav>

        {/* Support Card */}
        <div className="mt-4 rounded-2xl bg-[#f2f8f4] border border-[#dceddf] p-3 text-xs">
          <div className="mb-1 flex items-center gap-2 font-bold text-[#1b503d]">
            <FontAwesomeIcon icon={faCircleQuestion} /> Trợ giúp & Kết nối
          </div>
          <p className="text-[11px] leading-relaxed text-[#5f7a6a]">Hỗ trợ kỹ thuật và giải đáp thắc mắc 24/7.</p>
          <button onClick={() => openChatWith()} className="mt-2 text-[11px] font-bold text-[#176b52] hover:underline flex items-center gap-1">
            Mở khung chat hỗ trợ <FontAwesomeIcon icon={faArrowRight} className="text-[9px]" />
          </button>
        </div>

        <button onClick={logout} className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-[#7e8a82] hover:bg-slate-50">
          <FontAwesomeIcon icon={faRightFromBracket} /> Đăng xuất
        </button>
      </aside>

      {/* Main Container */}
      <main className="main-content min-h-screen pb-16 pl-[260px]">
        {/* Top Header */}
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#e9ede8] bg-white/90 px-8 backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="text-[11px] font-medium text-[#98a39c]">
              FreshFlow <span className="mx-1">/</span> <span className="font-bold text-[#45574d]">{title}</span>
            </div>

          </div>

          <div className="flex items-center gap-3">
            <GlobalSearch key={`${admin}-${apiState}`} admin={admin} apiState={apiState} products={products} orders={orders} requests={requests} />

            {/* Chat Icon Button */}
            <button
              onClick={() => openChatWith()}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#e6ebe6] bg-white text-[#57695f] hover:bg-slate-50"
              title="Mở tin nhắn trực tiếp"
            >
              <FontAwesomeIcon icon={faComments} className="text-sm text-[#176b52]" />
            </button>

            {/* Notifications */}
            <Link
              href="/notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#e6ebe6] bg-white text-[#57695f] hover:bg-slate-50"
            >
              <FontAwesomeIcon icon={faBell} className="text-sm" />
              {notifications.some(item => !item.is_read) && <i className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />}
            </Link>

            {/* Cart Button */}
            {!admin && !shipper && (
              <Link
                href="/cart"
                className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[#e6ebe6] bg-white text-[#57695f] hover:bg-slate-50"
              >
                <FontAwesomeIcon icon={faShoppingCart} />
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#176b52] text-[9px] font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </Link>
            )}

            {/* Profile pill */}
            <button
              onClick={() => router.push('/profile')}
              className="flex items-center gap-2.5 border-l border-[#e4e9e4] pl-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f5ec] text-xs font-extrabold text-[#176b52]">
                {currentUser?.full_name ? currentUser.full_name.slice(0, 2).toUpperCase() : 'FF'}
              </div>
              <div className="hidden text-left sm:block">
                <div className="text-xs font-bold text-[#1f2d25]">{currentUser?.full_name || 'Khách hàng'}</div>
                <div className="text-[10px] text-[#8c9890]">{currentUser?.customer_group || 'Nhóm sinh viên'}</div>
              </div>
            </button>
          </div>
        </header>

        {/* Content Body */}
        <div className="mx-auto max-w-[1440px] px-8 py-7">
          {/* Breadcrumb Title bar */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-1 text-[11px] font-semibold text-[#83a18c]">
                {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'full', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())}
              </div>
              <h1 className="text-[24px] font-extrabold tracking-tight text-[#1e2e26]">
                {page === 'dashboard'
                  ? admin
                    ? `Bảng điều khiển Quản Trị Viên`
                    : shop
                      ? `Kênh Cửa Hàng (Shop)`
                      : shipper
                        ? `Trung tâm Giao Hàng (Shipper)`
                        : 'Nông sản tươi ngon hôm nay'
                  : title}
              </h1>
            </div>

            <div className="flex gap-2">
              {page === 'dashboard' && !admin && !shop && !shipper && (
                <Link href="/requests">
                  <Button kind="secondary"><FontAwesomeIcon icon={faPlus} /> Yêu cầu mặt hàng</Button>
                </Link>
              )}
              {page === 'products' && (admin || shop) && (
                <Button onClick={() => { setEditingProduct(null); setProductEditorOpen(true); }}><FontAwesomeIcon icon={faPlus} /> Thêm sản phẩm</Button>
              )}
            </div>
          </div>

          {/* PAGE ROUTING DISPATCH */}

          {/* NEWFEED */}
          {(page === 'newfeed' || (!admin && !shop && !shipper && page === 'dashboard')) && (
            <Newfeed
              posts={posts}
              products={products}
              currentUser={currentUser}
              onAddToCart={addCart}
              onCreatePost={handleCreatePost}
              money={money}
            />
          )}

          {/* ADMIN DASHBOARD */}
          {page === 'dashboard' && admin && (
            <AdminDashboardView
              summary={financialSummary}
              vatConfigs={vatConfigs}
              vatHistory={vatHistory}
              recentOrders={orders}
              onUpdateVat={handleUpdateVat}
              money={money}
            />
          )}

          {/* SHOP PORTAL */}
          {(page === 'shop' || (page === 'dashboard' && shop) || (shop && ['products', 'orders', 'reviews'].includes(page))) && (
            <ShopPortalView
              currentUser={currentUser || ({} as any)}
              products={products}
              orders={orders}
              reviews={reviews}
              shippers={shippers}
              onAddProduct={() => { setEditingProduct(null); setProductEditorOpen(true); }}
              onEditProduct={product => { setEditingProduct(product); setProductEditorOpen(true); }}
              onAdjustInventory={adjustInventory}
              initialTab={page === 'products' ? 'products' : page === 'orders' ? 'orders' : page === 'reviews' ? 'reviews' : 'overview'}
              onUpdateOrderStatus={changeOrderStatus}
              onAssignShipper={handleAssignShipper}
              onReplyReview={handleReplyReview}
              money={money}
            />
          )}

          {/* SHIPPER PORTAL */}
          {(page === 'shipper' || (page === 'dashboard' && shipper) || (shipper && page === 'history')) && (
            <ShipperPortalView
              currentUser={currentUser || ({} as any)}
              assignedOrders={orders.filter(o => o.shipper_id === currentUser?.id)}
              availableOrders={orders.filter(o => !o.shipper_id && (o.status === 'Chờ Shipper lấy hàng' || o.status === 'READY_FOR_PICKUP'))}
              onClaimOrder={handleShipperClaim}
              onPickupOrder={handleShipperPickup}
              onDeliveringOrder={handleShipperDelivering}
              onCompleteOrder={handleShipperComplete}
              initialTab={page === 'history' ? 'history' : 'assigned'}
              money={money}
            />
          )}

          {/* PRODUCTS CATALOG */}
          {page === 'products' && (!shop || admin) && (
            <ProductsPanel
              query={query}
              setQuery={setQuery}
              admin={admin}
              products={filtered}
              category={category}
              setCategory={setCategory}
              addCart={addCart}
              money={money}
              create={() => { setEditingProduct(null); setProductEditorOpen(true); }}
              go={path => router.push(admin && isAdminRoute ? `/admin${path}` : path)}
              save={saveProductInline}
              remove={deleteProduct}
            />
          )}

          {/* INVENTORY */}
          {page === 'inventory' && <InventoryView products={products} money={money} adjust={adjustInventory} />}
          {page === 'products' && admin && <InventoryView products={products} money={money} adjust={adjustInventory} />}

          {/* ORDERS */}
          {page === 'orders' && !shop && (
            <div className="space-y-4">
              <OrdersView
                admin={admin}
                orders={orders}
                updateStatus={changeOrderStatus}
                statusTone={statusTone}
                money={money}
                tab={activeTab}
                setTab={setActiveTab}
              />

              {/* Review Buttons on completed orders for customers */}
              {!admin && !shop && !shipper && reviewableCompletedOrder && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs">
                  <div className="font-bold text-emerald-900 mb-1 flex items-center gap-2">
                    <FontAwesomeIcon icon={faStar} className="text-yellow-500" /> Đánh giá trải nghiệm đơn hàng
                  </div>
                  <p className="text-emerald-800 text-[11px] mb-3">
                    Bạn có đơn hàng đã giao thành công. Hãy chia sẻ cảm nhận để cửa hàng nâng cao chất lượng nhé!
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenReview(reviewableCompletedOrder.lines?.find(line => line.productId)?.productId || 0, reviewableCompletedOrder.lines?.find(line => line.productId)?.name || 'Nông sản', 'product')}
                      className="rounded-xl bg-[#176b52] px-3.5 py-1.5 font-bold text-white shadow-sm hover:bg-[#125340]"
                    >
                      Đánh giá sản phẩm đã mua
                    </button>
                    {reviewableCompletedOrder.shipper_id && <button
                      onClick={() => handleOpenReview(reviewableCompletedOrder.apiId || 0, 'Tài xế giao hàng', 'shipper')}
                      className="rounded-xl bg-blue-600 px-3.5 py-1.5 font-bold text-white shadow-sm hover:bg-blue-700"
                    >
                      Đánh giá Shipper
                    </button>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DELIVERIES */}
          {page === 'deliveries' && <Deliveries orders={orders} money={money} change={changeOrderStatus} statusTone={statusTone} />}

          {/* CUSTOMERS & GROUPS */}
          {page === 'customers' && <CustomersView notify={notify} apiState={apiState} />}

          {/* REQUESTS */}
          {page === 'requests' && (
            <RequestsView
              admin={admin}
              requests={requests}
              notify={notify}
              open={() => setModal('request')}
              update={updateRequest}
            />
          )}

          {/* REPORTS */}
          {page === 'reports' && <ReportsPanel money={money} apiState={apiState} orders={orders} />}

          {page === 'notifications' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Thông báo</h2><button onClick={() => void clearNotifications()} className="text-xs font-bold text-[#176b52]">Đánh dấu tất cả đã đọc</button></div>
              {notifications.length === 0 && <div className="panel p-10 text-center text-sm text-slate-500">Bạn chưa có thông báo nào.</div>}
              {notifications.map(item => <article key={item.id} className={`panel flex items-start gap-3 p-4 ${item.is_read ? 'opacity-70' : 'border-emerald-200 bg-emerald-50/40'}`}><span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-600" /><div className="flex-1"><h3 className="text-sm font-bold">{item.title}</h3><p className="mt-1 text-xs text-slate-600">{item.body}</p><time className="mt-2 block text-[10px] text-slate-400">{item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : item.event_type}</time></div>{!item.is_read && <button onClick={() => void markNotificationRead(item.id)} className="text-xs font-semibold text-[#176b52]">Đã đọc</button>}</article>)}
            </section>
          )}

          {/* PROFILE & ADDRESSES */}
          {page === 'profile' && <ApiProfile />}

          {/* CART & CHECKOUT */}
          {page === 'cart' && (
            <Cart
              products={products}
              cart={cart}
              setCart={setCart}
              money={money}
              go={path => router.push(admin && isAdminRoute ? `/admin${path}` : path)}
            />
          )}

          {page === 'checkout' && (
            <ApiCheckout money={money} total={cartTotal} cart={cart} done={placeOrder} />
          )}

          {/* PRODUCT DETAIL */}
          {detailId && detailProduct && (
            <ProductDetail
              product={detailProduct}
              addCart={addCart}
              money={money}
              go={path => router.push(admin && isAdminRoute ? `/admin${path}` : path)}
            />
          )}

          {/* ORDER DETAIL */}
          {orderDetailId && detailOrder && (
            <OrderDetailView
              order={detailOrder}
              statusTone={statusTone}
              money={money}
              admin={admin && isAdminRoute}
              updateStatus={changeOrderStatus}
              go={path => router.push(admin && isAdminRoute ? `/admin${path}` : path)}
            />
          )}
        </div>
      </main>

      {/* Floating Chat Modal */}
      <ChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        currentUser={currentUser}
        conversations={conversations}
        activePeerId={activePeerId}
        messages={chatMessages}
        onSelectPeer={peerId => {
          setActivePeerId(peerId);
          openChatWith(peerId);
        }}
        onSendMessage={handleSendChatMessage}
      />

      {/* Review Modal */}
      <ReviewModal
        isOpen={reviewModalData.isOpen}
        onClose={() => setReviewModalData(prev => ({ ...prev, isOpen: false }))}
        type={reviewModalData.type}
        targetId={reviewModalData.targetId}
        targetTitle={reviewModalData.title}
        onSubmit={handleSubmitReview}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-[#1e2f26] px-4 py-3 text-xs font-semibold text-white shadow-2xl backdrop-blur">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px]">
            <FontAwesomeIcon icon={faCheck} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}
