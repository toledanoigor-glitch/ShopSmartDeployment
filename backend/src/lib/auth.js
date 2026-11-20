import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const developmentSecret = crypto.randomBytes(32).toString('hex');

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set to at least 32 characters in production.');
  return developmentSecret;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password), salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function sign(payload) {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createToken(userId, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(now / 1000) + TOKEN_TTL_SECONDS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readToken(token, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const given = Buffer.from(signature);
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isInteger(data.sub) || !Number.isInteger(data.exp) || data.exp * 1000 <= now) return null;
    return { userId: data.sub };
  } catch {
    return null;
  }
}

export function tokenFromHeader(header) {
  const value = String(header || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : null;
}

export function canReadOrder(user, order) {
  return Boolean(user && order && order.userId === user.id);
}

export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

export function checkSessionConfig() {
  sessionSecret();
}
