const base = (process.argv[2] || 'http://localhost:3000/api').replace(/\/$/, '');
const stamp = Date.now();
const results = [];

async function call(method, path, { token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

function record(check, expected, actual, note = '') {
  results.push({ check, expected, actual, result: expected === actual ? 'PASS' : 'FAIL', note });
}

const health = await call('GET', '/health');
record('Health check (API + database)', 200, health.status, JSON.stringify(health.data));

const guestList = await call('GET', '/orders');
record('Guest lists orders', 401, guestList.status, guestList.data?.error?.code);

const guestOrder = await call('POST', '/orders', { body: { customerName: 'Guest Tester', email: 'guest@example.com', address: '1 Guest Street, Angeles City', items: [{ productId: 1, quantity: 1 }] } });
record('Guest places order', 401, guestOrder.status, guestOrder.data?.error?.code);

const owner = await call('POST', '/auth/register', { body: { name: 'Owner Tester', email: `owner.${stamp}@example.com`, password: 'demo-pass-123' } });
record('Owner registers (fictional)', 201, owner.status);
const other = await call('POST', '/auth/register', { body: { name: 'Other Tester', email: `other.${stamp}@example.com`, password: 'demo-pass-123' } });
record('Other customer registers (fictional)', 201, other.status);

const products = await call('GET', '/products');
const product = products.data?.products?.find((item) => item.stock > 0);
const order = await call('POST', '/orders', { token: owner.data?.token, body: { customerName: 'Owner Tester', email: `owner.${stamp}@example.com`, address: '12 Owner Street, Angeles City', items: [{ productId: product?.id, quantity: 1 }] } });
record('Owner places order', 201, order.status, `order #${order.data?.id}, ${product?.name}`);

const orderId = order.data?.id;
const ownerRead = await call('GET', `/orders/${orderId}`, { token: owner.data?.token });
record('Owner reads own order', 200, ownerRead.status);
const otherRead = await call('GET', `/orders/${orderId}`, { token: other.data?.token });
record("Other customer reads owner's order", 403, otherRead.status, otherRead.data?.error?.code);
const guestRead = await call('GET', `/orders/${orderId}`);
record("Guest reads owner's order", 401, guestRead.status, guestRead.data?.error?.code);
const otherList = await call('GET', '/orders', { token: other.data?.token });
record("Other customer's list hides owner's order", 'hidden', otherList.data?.orders?.some((item) => item.id === orderId) ? 'visible' : 'hidden');

const excess = await call('POST', '/orders', { token: owner.data?.token, body: { customerName: 'Owner Tester', email: `owner.${stamp}@example.com`, address: '12 Owner Street, Angeles City', items: [{ productId: product?.id, quantity: (product?.stock ?? 0) + 1 }] } });
record('Order above stock is refused', excess.status === 422 ? 422 : 409, excess.status, excess.data?.error?.code);

const badLogin = await call('POST', '/auth/login', { body: { email: `owner.${stamp}@example.com`, password: 'wrong-password' } });
record('Wrong password is refused', 401, badLogin.status, badLogin.data?.error?.code);

console.log(`API: ${base}`);
console.table(results);
const failed = results.filter((item) => item.result === 'FAIL').length;
console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
process.exitCode = failed ? 1 : 0;
