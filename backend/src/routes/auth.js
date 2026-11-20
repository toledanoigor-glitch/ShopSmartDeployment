import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { createToken, hashPassword, publicUser, verifyPassword } from '../lib/auth.js';
import { requireUser } from '../middleware/requireUser.js';
import { loginSchema, registerSchema } from '../validators/schemas.js';
const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

router.post('/register', authLimiter, async (request, response, next) => {
  try {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return response.status(422).json({ error: { code: 'INVALID_ACCOUNT', message: 'Name needs 2 to 80 characters, a valid email, and a password of at least 8 characters.' } });
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (existing) return response.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists.' } });
    const user = await prisma.user.create({ data: { name: parsed.data.name, email: parsed.data.email, passwordHash: hashPassword(parsed.data.password) } });
    response.status(201).json({ token: createToken(user.id), user: publicUser(user) });
  } catch (error) { next(error); }
});

router.post('/login', authLimiter, async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return response.status(422).json({ error: { code: 'INVALID_LOGIN', message: 'Enter a valid email and password.' } });
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) return response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
    response.json({ token: createToken(user.id), user: publicUser(user) });
  } catch (error) { next(error); }
});

router.get('/me', requireUser, (request, response) => response.json({ user: request.user }));

export default router;
