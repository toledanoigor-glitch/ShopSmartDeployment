import { prisma } from '../lib/prisma.js';
import { readToken, tokenFromHeader } from '../lib/auth.js';

export async function requireUser(request, response, next) {
  const session = readToken(tokenFromHeader(request.get('authorization')));
  if (!session) return response.status(401).json({ error: { code: 'SIGN_IN_REQUIRED', message: 'Please sign in to continue.' } });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, name: true, email: true } });
  if (!user) return response.status(401).json({ error: { code: 'SIGN_IN_REQUIRED', message: 'Please sign in to continue.' } });
  request.user = user;
  next();
}
