import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { PUBLIC_PRODUCT_FIELDS } from '../services/assistant.js';
import { answerQuestion } from '../services/groundedAnswer.js';
import { assistantQuestionSchema } from '../validators/schemas.js';
const router = Router();

const assistantLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

router.post('/questions', assistantLimiter, async (request, response, next) => {
  try {
    const parsed = assistantQuestionSchema.safeParse(request.body);
    if (!parsed.success) return response.status(422).json({ error: { code: 'INVALID_QUESTION', message: 'Question must contain between 3 and 300 characters.' } });
    const products = await prisma.product.findMany({ where: { active: true }, select: PUBLIC_PRODUCT_FIELDS, orderBy: { price: 'asc' } });
    const result = await answerQuestion(products, parsed.data.question, {
      log: (message) => console.warn(`[${request.id}] assistant ${message}`)
    });
    response.json(result);
  } catch (error) { next(error); }
});

export default router;