const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness(env = {}) {
  const storage = new Map(), calls = [], events = [], sockets = [], timers = new Map(), cache = {};
  let timerId = 0, reply = { status: 200, body: {} };
  const globals = {
    process: { env }, Headers, FormData, URL, URLSearchParams, Event,
    window: { location: { origin: 'https://frontend.test' }, dispatchEvent: event => events.push(event.type) },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      const current = typeof reply === 'function' ? reply(url, init) : reply;
      if (current instanceof Error) throw current;
      return { ok: current.status < 400, status: current.status, json: async () => current.body };
    },
    WebSocket: class {
      constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); }
      close() { this.readyState = 3; this.onclose?.(); }
    },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
  };
  function load(name) {
    if (cache[name]) return cache[name];
    const exports = {};
    const source = fs.readFileSync(`src/lib/${name}.ts`, 'utf8');
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
      { ...globals, exports, require: path => load(path.replace('./', '')) });
    return (cache[name] = exports);
  }
  return { load, calls, events, sockets, timers, respond: value => { reply = value; } };
}

async function main() {
  const h = harness();
  const { freshflow: f, authToken, ApiError, unwrapList } = h.load('api');
  authToken.set('test-jwt');
  const product = { name: 'Test', base_price: 12000 };
  const address = { recipient: 'Test', phone: '0900000000', line1: '123 Street', city: 'HCM' };
  const cases = [
    ['GET', '/health', () => f.health()],
    ['POST', '/auth/register', () => f.register({ email: 'test@example.com', full_name: 'Test', password: 'password123', customer_group: 'STUDENT' })],
    ['GET', '/auth/me', () => f.me()],
    ['GET', '/admin/users?search=Test', () => f.users('Test')],
    ['PATCH', '/admin/users/7/status?is_active=false', () => f.userStatus(7, false)],
    ['GET', '/addresses', () => f.addresses()],
    ['POST', '/addresses', () => f.createAddress(address)],
    ['PATCH', '/addresses/7', () => f.updateAddress(7, address)],
    ['DELETE', '/addresses/7', () => f.deleteAddress(7)],
    ['GET', '/categories', () => f.categories()],
    ['POST', '/admin/categories', () => f.createCategory('Test')],
    ['GET', '/products?category_id=2', () => f.products(2)],
    ['GET', '/catalog/me?category_id=2', () => f.catalog(2)],
    ['POST', '/admin/products', () => f.createProduct(product)],
    ['PATCH', '/admin/products/3', () => f.updateProduct(3, product)],
    ['DELETE', '/admin/products/3', () => f.deleteProduct(3)],
    ['POST', '/admin/products/3/batches', () => f.createBatch(3, { batch_date: '2026-10-25T00:00:00Z', initial_quantity: 10 })],
    ['GET', '/admin/products/3/batches', () => f.batches(3)],
    ['PUT', '/admin/products/3/prices/STUDENT', () => f.price(3, 'STUDENT', 12000)],
    ['POST', '/admin/delivery-slots', () => f.createDeliverySlot({ name: 'Morning', fee: 10000 })],
    ['GET', '/delivery-slots', () => f.deliverySlots()],
    ['POST', '/orders', () => f.createOrder({ items: [{ batch_id: 4, quantity: 2 }], delivery_type: 'PICKUP', delivery_slot_id: 1 })],
    ['GET', '/orders?status=PENDING', () => f.orders('PENDING')],
    ['GET', '/orders/5', () => f.order(5)],
    ['GET', '/orders/5/history', () => f.orderHistory(5)],
    ['PATCH', '/admin/orders/5/status', () => f.orderStatus(5, 'APPROVED', 'Approved')],
    ['POST', '/product-requests', () => f.createRequest('Test', 'Description')],
    ['GET', '/product-requests', () => f.productRequests()],
    ['PATCH', '/admin/product-requests/6', () => f.respondRequest(6, { status: 'QUOTED', quoted_price: 12000 })],
    ['GET', '/notifications', () => f.notifications()],
    ['PATCH', '/notifications/1/read', () => f.readNotification(1)],
    ['POST', '/admin/notifications/broadcast', () => f.broadcastNotification({ title: 'Test Title', body: 'Test Body' })],
    ['POST', '/admin/moderation/terms?term=test+term', () => f.addModerationTerm('test term')],
    ['POST', '/auth/request-otp', () => f.requestOtp({ target: 'test@example.com', purpose: 'register' })],
    ['POST', '/auth/verify-otp', () => f.verifyOtp({ target: 'test@example.com', code: '123456', purpose: 'register' })],
    ['POST', '/auth/reset-password', () => f.resetPassword({ target: 'test@example.com', code: '123456', new_password: 'newpass' })],
    ['PATCH', '/users/profile', () => f.updateProfile({ full_name: 'Updated Name' })],
    ['GET', '/shops', () => f.shops()],
    ['GET', '/shippers', () => f.shippers()],
    ['DELETE', '/admin/delivery-slots/1', () => f.deleteDeliverySlot(1)],
    ['PATCH', '/orders/5/assign-shipper', () => f.assignShipper(5, 2)],
    ['GET', '/shipper/orders?available_only=false', () => f.shipperOrders(undefined, false)],
    ['PATCH', '/shipper/orders/5/claim', () => f.claimShipperOrder(5)],
    ['PATCH', '/shipper/orders/5/pickup', () => f.shipperPickup(5)],
    ['PATCH', '/shipper/orders/5/delivering', () => f.shipperDelivering(5)],
    ['PATCH', '/shipper/orders/5/complete?paid_amount=60000', () => f.shipperComplete(5, 60000)],
    ['GET', '/posts', () => f.posts()],
    ['POST', '/posts', () => f.createPost({ title: 'New Post' })],
    ['PATCH', '/posts/1', () => f.updatePost(1, { title: 'Updated' })],
    ['DELETE', '/posts/1', () => f.deletePost(1)],
    ['GET', '/products/3/reviews', () => f.productReviews(3)],
    ['POST', '/products/3/reviews', () => f.createProductReview(3, { rating: 5 })],
    ['GET', '/shop/reviews', () => f.shopReviews()],
    ['POST', '/reviews/1/reply', () => f.replyReview(1, 'Thank you')],
    ['POST', '/orders/5/shipper-review', () => f.reviewShipper(5, { rating: 5 })],
    ['GET', '/admin/reviews', () => f.adminReviews()],
    ['GET', '/customer-groups', () => f.customerGroups()],
    ['POST', '/admin/customer-groups', () => f.createCustomerGroup({ code: 'VIP', name: 'VIP' })],
    ['GET', '/admin/vat', () => f.adminVatConfigs()],
    ['GET', '/admin/vat/history', () => f.vatHistory()],
    ['GET', '/chat/messages', () => f.chatMessages()],
    ['POST', '/chat/messages', () => f.sendChatMessage({ content: 'Hello' })],
    ['GET', '/chat/users', () => f.chatUsers()],
    ['DELETE', '/admin/moderation/terms/1', () => f.deleteModerationTerm(1)],
    ['GET', '/admin/moderation/violations', () => f.moderationViolations()],
    ['GET', '/admin/reports/summary?date_from=2026-10-01T00%3A00%3A00Z&date_to=2026-11-01T00%3A00%3A00Z', () => f.report('2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z')],
    ['GET', '/admin/audit-logs?limit=100', () => f.auditLogs()],
  ];
  for (const [method, path, run] of cases) {
    await run(); const call = h.calls.at(-1);
    assert.equal(call.method || 'GET', method, path);
    assert.equal(call.url, `http://localhost:8000/api/v1${path}`);
    assert.equal(call.headers.get('Authorization'), 'Bearer test-jwt', path);
    assert.equal(call.credentials, 'omit');
    assert.equal(call.headers.has('Content-Type'), call.body !== undefined, path);
  }
  const body = path => JSON.parse(h.calls.find(call => new URL(call.url).pathname.endsWith(path) && call.body)?.body);
  assert.deepEqual(body('/admin/products'), product);
  assert.deepEqual(body('/admin/products/3/prices/STUDENT'), { customer_group: 'STUDENT', unit_price: 12000 });
  assert.equal(body('/orders').items[0].batch_id, 4);
  assert.equal(body('/admin/orders/5/status').status, 'APPROVED');
  h.respond(url => url.endsWith('/auth/login') ? { status: 200, body: { access_token: 'new-jwt', token_type: 'bearer' } } : { status: 200, body: { id: 7, role: 'ADMIN' } });
  assert.equal((await f.login('test@example.com', 'password123')).role, 'ADMIN');
  assert.deepEqual(JSON.parse(h.calls.at(-2).body), { username: 'test@example.com', password: 'password123' });
  assert.equal(h.calls.at(-2).headers.has('Authorization'), false);
  assert.equal(h.calls.at(-1).headers.get('Authorization'), 'Bearer new-jwt');

  const documented = [...fs.readFileSync('../../docs/api-spec.md', 'utf8').matchAll(/\| `(GET|POST|PATCH|PUT|DELETE)` \| `([^`]+)`/g)].filter(match => match[2].startsWith('/api/v1/'));
  for (const [, method, template] of documented) {
    const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`);
    assert.ok(h.calls.some(call => (call.method || 'GET') === method && pattern.test(new URL(call.url).pathname)), `Missing route: ${method} ${template}`);
  }
  h.respond({ status: 204 }); assert.equal(await f.readNotification(1), undefined);
  h.respond({ status: 422, body: { detail: [{ loc: ['body', 'email'], msg: 'Invalid email' }] } });
  await assert.rejects(f.me(), error => error instanceof ApiError && error.status === 422 && error.message === 'body.email: Invalid email');
  h.respond({ status: 403, body: { detail: 'Forbidden' } });
  await assert.rejects(f.me(), error => error.status === 403); assert.equal(authToken.get(), 'new-jwt');
  h.respond(new Error('Network failure')); await assert.rejects(f.me(), error => error instanceof ApiError && !error.status);
  h.respond({ status: 401, body: { detail: 'Expired' } });
  await assert.rejects(f.me(), error => error instanceof ApiError && error.status === 401);
  assert.equal(authToken.get(), null); assert.deepEqual(h.events, ['freshflow:unauthorized']);
  assert.throws(() => unwrapList({ wrong: [] }), ApiError); assert.throws(() => unwrapList(null), ApiError);
  assert.deepEqual(unwrapList({ items: [1] }), [1]); assert.deepEqual(unwrapList({ data: [2] }), [2]);
  h.respond({ status: 200, body: { token_type: 'bearer' } }); await assert.rejects(f.login('bad', 'bad'), ApiError);
  assert.equal(authToken.get(), null);

  for (const [env, expected] of [[{}, 'ws://localhost:8000/api/v1/ws'], [{ NEXT_PUBLIC_API_URL: 'https://api.test/api/v1' }, 'wss://api.test/api/v1/ws'], [{ NEXT_PUBLIC_WS_URL: 'wss://gateway.test/api/v1/ws' }, 'wss://gateway.test/api/v1/ws']]) {
    const current = harness(env); current.load('api').authToken.set('jwt+/?=');
    const { RealtimeClient, websocketUrl } = current.load('realtime');
    const url = new URL(websocketUrl()); assert.equal(`${url.protocol}//${url.host}${url.pathname}`, expected); assert.equal(url.searchParams.get('token'), 'jwt+/?=');
    const events = []; const client = new RealtimeClient(event => events.push(event)); client.connect(); client.connect(); assert.equal(current.sockets.length, 1);
    current.sockets[0].onmessage({ data: '{bad-json' }); assert.equal(events.length, 0);
    current.sockets[0].onmessage({ data: '{"type":"connection.ready","data":{}}' }); assert.equal(events.length, 1);
    current.sockets[0].onclose(); assert.equal(current.timers.size, 1); client.close(); assert.equal(current.timers.size, 0);
  }
  const { allocateOrderItems, reportRange } = h.load('order-payload');
  const batches = [{ id: 11, is_open: true, initial_quantity: '3', approved_quantity: '1' }, { id: 12, is_open: true, available_quantity: '4' }];
  assert.equal(JSON.stringify(allocateOrderItems([{ id: 1, batches }], { 1: 5 })), JSON.stringify([{ batch_id: 11, quantity: 2 }, { batch_id: 12, quantity: 3 }]));
  for (const [catalog, cart] of [[[{ id: 1 }], { 1: 1 }], [[{ id: 1, batches }], { 1: 7 }], [[{ id: 1, batches }], { 1: -1 }], [[], { 1: 1 }], [[{ id: 1, batches: [{ id: 0, is_open: true, available_quantity: 5 }] }], { 1: 1 }]]) assert.throws(() => allocateOrderItems(catalog, cart));
  assert.equal(reportRange('2026-10').date_from, '2026-09-30T17:00:00.000Z');
  assert.equal(reportRange('2026-10').date_to, '2026-10-31T16:59:59.999Z');
  assert.equal(reportRange('2026-12').date_to, '2026-12-31T16:59:59.999Z');
  assert.throws(() => reportRange(''));
  console.log(`Integration checks passed: ${documented.length} REST routes; authentication, errors, WebSocket, batches and reports.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
