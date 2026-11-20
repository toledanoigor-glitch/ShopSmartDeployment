import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadOrder, createToken, hashPassword, readToken, tokenFromHeader, verifyPassword } from '../src/lib/auth.js';
import { loginSchema, registerSchema } from '../src/validators/schemas.js';

test('password hash verifies the right password only', () => {
  const stored = hashPassword('demo-pass-123');
  assert.notEqual(stored, 'demo-pass-123');
  assert.equal(verifyPassword('demo-pass-123', stored), true);
  assert.equal(verifyPassword('wrong-pass', stored), false);
});

test('session token round-trips the user id', () => {
  assert.deepEqual(readToken(createToken(7)), { userId: 7 });
});

test('tampered session token is rejected', () => {
  const [payload, signature] = createToken(7).split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 8, exp: 9999999999 })).toString('base64url');
  assert.equal(readToken(`${forged}.${signature}`), null);
  assert.equal(readToken(`${payload}.bad`), null);
  assert.equal(readToken('nonsense'), null);
});

test('expired session token is rejected', () => {
  const token = createToken(7, Date.UTC(2026, 0, 1));
  assert.equal(readToken(token, Date.UTC(2026, 0, 2)), null);
});

test('bearer header is parsed', () => {
  assert.equal(tokenFromHeader('Bearer abc.def'), 'abc.def');
  assert.equal(tokenFromHeader('Basic abc'), null);
  assert.equal(tokenFromHeader(undefined), null);
});

test('only the owner can read an order', () => {
  const order = { id: 3, userId: 1 };
  assert.equal(canReadOrder({ id: 1 }, order), true);
  assert.equal(canReadOrder({ id: 2 }, order), false);
  assert.equal(canReadOrder(null, order), false);
  assert.equal(canReadOrder({ id: 1 }, { id: 4, userId: null }), false);
});

test('registration validation rejects weak input and normalizes email', () => {
  assert.equal(registerSchema.safeParse({ name: 'A', email: 'bad', password: 'short' }).success, false);
  const ok = registerSchema.safeParse({ name: 'Juan Dela Cruz', email: ' Juan@Example.com ', password: 'demo-pass-123' });
  assert.equal(ok.success, true);
  assert.equal(ok.data.email, 'juan@example.com');
  assert.equal(loginSchema.safeParse({ email: 'juan@example.com', password: '' }).success, false);
});
