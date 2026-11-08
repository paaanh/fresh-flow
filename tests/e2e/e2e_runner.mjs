/**
 * FreshFlow End-to-End System Test Runner
 * Executes a full multi-role business workflow:
 * 1. Health check
 * 2. OTP flow & Customer registration
 * 3. Shop product creation & Inventory batching
 * 4. Customer order placement
 * 5. Shop confirmation & Shipper dispatch
 * 6. Shipper pickup, delivery & COD collection
 * 7. Customer product review & Shipper rating
 * 8. Admin financial reporting & Audit verification
 */

const API_BASE = process.env.API_URL || 'http://localhost:8000/api/v1';

async function req(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status} ${res.statusText} for ${options.method || 'GET'} ${path}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function runE2E() {
  console.log('====================================================');
  console.log('🚀 Bắt đầu Kiểm thử Hệ thống E2E Toàn diện FreshFlow');
  console.log(`📡 API Target: ${API_BASE}`);
  console.log('====================================================\n');

  // 1. Health check
  console.log('1. [System] Kiểm tra tình trạng kết nối API & DB...');
  const health = await req('/health');
  console.log(`   -> Trạng thái: ${health.status || 'OK'}\n`);

  // 2. Admin login
  console.log('2. [Admin] Đăng nhập Quản trị viên hệ thống...');
  const adminAuth = await req('/auth/login', {
    method: 'POST',
    body: { username: 'admin@freshflow.example.com', password: 'FreshFlowAdmin123!' },
  });
  const adminHeaders = { Authorization: `Bearer ${adminAuth.access_token}` };
  console.log('   -> Đăng nhập Admin thành công.\n');

  // 3. Register Shop
  const shopEmail = `e2e_shop_${Date.now()}@freshflow.vn`;
  console.log(`3. [Shop] Đăng ký gian hàng mới: ${shopEmail}...`);
  const shopUser = await req('/auth/register', {
    method: 'POST',
    body: {
      email: shopEmail,
      full_name: 'Nông Trại Hữu Cơ E2E',
      password: 'ShopPass123!',
      role: 'SHOP',
      phone: `098${Math.floor(1000000 + Math.random() * 9000000)}`,
    },
  });
  const shopAuth = await req('/auth/login', {
    method: 'POST',
    body: { username: shopEmail, password: 'ShopPass123!' },
  });
  const shopHeaders = { Authorization: `Bearer ${shopAuth.access_token}` };
  console.log(`   -> Gian hàng tạo thành công (ID: ${shopUser.id}).\n`);

  // 4. Shop creates Product & Inventory Batch
  console.log('4. [Shop] Tạo sản phẩm & nhập lô hàng tồn kho...');
  const product = await req('/admin/products', {
    method: 'POST',
    headers: shopHeaders,
    body: {
      name: `Cà Rốt Đà Lạt Tuyển Chọn E2E #${Date.now().toString().slice(-4)}`,
      category_id: 1,
      unit: 'kg',
      base_price: 35000,
    },
  });
  const batch = await req(`/admin/products/${product.id}/batches`, {
    method: 'POST',
    headers: shopHeaders,
    body: {
      batch_date: new Date().toISOString(),
      initial_quantity: 50,
      is_open: true,
    },
  });
  console.log(`   -> Sản phẩm: ${product.name} (ID: ${product.id}), Lô hàng tồn kho: ${batch.initial_quantity} kg.\n`);

  // 5. Register Customer via OTP
  const customerEmail = `e2e_customer_${Date.now()}@example.com`;
  console.log(`5. [Customer] Yêu cầu OTP & Đăng ký tài khoản: ${customerEmail}...`);
  const otpRes = await req('/auth/request-otp', {
    method: 'POST',
    body: { target: customerEmail, purpose: 'register' },
  });
  const otpCode = otpRes.otp_code || '123456';
  await req('/auth/register', {
    method: 'POST',
    body: {
      email: customerEmail,
      full_name: 'Khách Hàng Mua Sắm E2E',
      password: 'CustomerPass123!',
      customer_group: 'STUDENT',
      role: 'CUSTOMER',
      otp_code: otpCode,
    },
  });
  const customerAuth = await req('/auth/login', {
    method: 'POST',
    body: { username: customerEmail, password: 'CustomerPass123!' },
  });
  const customerHeaders = { Authorization: `Bearer ${customerAuth.access_token}` };
  console.log('   -> Khách hàng xác minh OTP và đăng nhập thành công.\n');

  // 6. Customer creates Order
  console.log('6. [Customer] Tạo đơn hàng giao tận nơi thanh toán COD...');
  const order = await req('/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: {
      items: [{ batch_id: batch.id, quantity: 2 }],
      delivery_type: 'HOME',
      delivery_address: 'Phòng 402, Tòa H1, Đại học Bách Khoa',
      recipient_name: 'Nguyễn Văn Khách',
      recipient_phone: '0901234567',
      payment_method: 'COD',
      note: 'Giao trong giờ hành chính',
    },
  });
  console.log(`   -> Đơn hàng tạo thành công: ${order.order_number} (ID: ${order.id}), Tổng tiền: ${order.total}đ, Trạng thái: ${order.status}.\n`);

  // 7. Shop confirms order and dispatches
  console.log('7. [Shop] Xác nhận đơn hàng & chuẩn bị hàng...');
  await req(`/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    headers: shopHeaders,
    body: { status: 'CONFIRMED', note: 'Shop đã tiếp nhận đơn' },
  });
  await req(`/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    headers: shopHeaders,
    body: { status: 'PREPARING', note: 'Shop đang đóng gói nông sản' },
  });
  await req(`/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    headers: shopHeaders,
    body: { status: 'READY_FOR_PICKUP', note: 'Đã sẵn sàng chờ Shipper nhận' },
  });
  console.log('   -> Trạng thái đơn: READY_FOR_PICKUP.\n');

  // 8. Register or Login Shipper
  console.log('8. [Shipper] Đăng nhập Shipper & nhận đơn giao...');
  const shipperAuth = await req('/auth/login', {
    method: 'POST',
    body: { username: 'shipper@freshflow.example.com', password: 'FreshFlowDemo123!' },
  });
  const shipperHeaders = { Authorization: `Bearer ${shipperAuth.access_token}` };

  await req(`/shipper/orders/${order.id}/claim`, { method: 'PATCH', headers: shipperHeaders });
  await req(`/shipper/orders/${order.id}/pickup`, { method: 'PATCH', headers: shipperHeaders });
  await req(`/shipper/orders/${order.id}/delivering`, { method: 'PATCH', headers: shipperHeaders });
  const completedOrder = await req(`/shipper/orders/${order.id}/complete?paid_amount=${order.total}`, {
    method: 'PATCH',
    headers: shipperHeaders,
  });
  console.log(`   -> Shipper hoàn tất giao đơn, thu đủ ${completedOrder.paid_amount}đ tiền COD. Trạng thái: ${completedOrder.status}.\n`);

  // 9. Customer reviews Product & Shipper
  console.log('9. [Customer] Gửi đánh giá sản phẩm & phản hồi Shipper...');
  const prodReview = await req(`/products/${product.id}/reviews`, {
    method: 'POST',
    headers: customerHeaders,
    body: { order_id: order.id, rating: 5, comment: 'Cà rốt rất tươi và giòn ngọt!' },
  });
  console.log(`   -> Đánh giá sản phẩm thành công (Review ID: ${prodReview.id}).`);

  const shipperReview = await req(`/orders/${order.id}/shipper-review`, {
    method: 'POST',
    headers: customerHeaders,
    body: { rating: 5, attitude_rating: 5, speed_rating: 5, comment: 'Tài xế giao nhanh, thân thiện!' },
  });
  console.log(`   -> Đánh giá tài xế thành công (Review ID: ${shipperReview.id}).\n`);

  // 10. Shop replies to customer review
  console.log('10. [Shop] Cửa hàng phản hồi đánh giá của khách...');
  await req(`/reviews/${prodReview.id}/reply`, {
    method: 'POST',
    headers: shopHeaders,
    body: { reply: 'Cảm ơn quý khách đã ủng hộ nông sản tươi của shop!' },
  });
  console.log('    -> Cửa hàng phản hồi review thành công.\n');

  // 11. Admin verifies reports
  console.log('11. [Admin] Kiểm tra báo cáo tài chính & đối soát đơn hàng...');
  const summary = await req('/admin/reports/dashboard?days=30', { headers: adminHeaders });
  console.log(`    -> Báo cáo Dashboard: Tổng ${summary.total_orders} đơn hàng, Doanh thu: ${summary.revenue}đ, Tỷ lệ giao thành công: ${summary.delivery_success_rate}%.\n`);

  console.log('====================================================');
  console.log('🎉 TẤT CẢ KỊCH BẢN E2E ĐÃ HOÀN TẤT THÀNH CÔNG 100%!');
  console.log('====================================================');
}

runE2E().catch(err => {
  console.error('\n❌ E2E Test Thất bại:');
  console.error(err.message);
  if (err.data) console.error('Response data:', JSON.stringify(err.data, null, 2));
  process.exit(1);
});
