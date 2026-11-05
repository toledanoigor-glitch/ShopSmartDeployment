import { buildRuleBasedAnswer, formatResponse, selectCandidates } from './assistant.js';
import { draftWithGemini } from './gemini.js';

const FALLBACK_NOTICES = {
  NOT_CONFIGURED: 'The AI helper is not set up, so this answer was built directly from the catalog.',
  TIMEOUT: 'The AI helper took too long, so this answer was built directly from the catalog.',
  RATE_LIMITED: 'The AI helper is busy right now, so this answer was built directly from the catalog.',
  UNAVAILABLE: 'The AI helper is unavailable right now, so this answer was built directly from the catalog.',
  INVALID_FORMAT: 'The AI helper gave an unusable reply, so this answer was built directly from the catalog.',
  UNVERIFIED: 'The AI draft included details we could not verify, so this answer was built directly from the catalog.'
};

const UNAVAILABLE_WORDS = /\b(out of stock|sold out|unavailable|not available|no stock)\b/i;

export function extractPrices(text) {
  const matches = String(text).matchAll(/(?:₱|php\s*|p(?=\d))\s*(\d[\d,]*(?:\.\d{1,2})?)/gi);
  return [...matches].map((match) => Number(match[1].replaceAll(',', '')));
}

export function verifyDraft(draft, { candidates, budget }, allProducts = []) {
  const selectedIds = new Set(candidates.map((p) => p.id));
  const allowedPrices = new Set(candidates.map((p) => p.price));
  if (budget !== null) allowedPrices.add(budget);

  if (!draft.answer || draft.answer.length > 800) return { ok: false, reason: 'Answer is empty or too long.' };
  if (draft.productIds.length === 0) return { ok: false, reason: 'No product ids returned although products were selected.' };
  const unknown = draft.productIds.filter((id) => !selectedIds.has(id));
  if (unknown.length > 0) return { ok: false, reason: `Unknown product ids: ${unknown.join(', ')}` };

  const badPrices = extractPrices(draft.answer).filter((price) => !allowedPrices.has(price));
  if (badPrices.length > 0) return { ok: false, reason: `Unsupported prices: ${badPrices.join(', ')}` };

  if (UNAVAILABLE_WORDS.test(draft.answer)) return { ok: false, reason: 'Answer makes an availability claim that contradicts stock.' };

  const answerLower = draft.answer.toLowerCase();
  const otherNames = allProducts.filter((p) => !selectedIds.has(p.id)).map((p) => p.name.toLowerCase());
  const mentioned = otherNames.filter((name) => answerLower.includes(name));
  if (mentioned.length > 0) return { ok: false, reason: `Mentions products that were not selected: ${mentioned.join(', ')}` };

  return { ok: true };
}

export async function answerQuestion(products, question, { provider = draftWithGemini, log = () => {} } = {}) {
  const selection = selectCandidates(products, question);

  if (selection.candidates.length === 0) {
    return formatResponse(buildRuleBasedAnswer(selection), [], { mode: 'no-match' });
  }

  const fallback = (code) => formatResponse(buildRuleBasedAnswer(selection), selection.candidates, {
    mode: 'fallback',
    notice: FALLBACK_NOTICES[code] || FALLBACK_NOTICES.UNAVAILABLE
  });

  let draft;
  try {
    draft = await provider({ question, candidates: selection.candidates, budget: selection.budget });
  } catch (error) {
    log(`provider failed: ${error.code || 'UNKNOWN'} (${error.message})`);
    return fallback(error.code);
  }

  const check = verifyDraft(draft, selection, products);
  if (!check.ok) {
    log(`draft rejected: ${check.reason}`);
    return fallback('UNVERIFIED');
  }

  const chosen = draft.productIds.map((id) => selection.candidates.find((p) => p.id === id));
  return formatResponse(draft.answer, [...new Set(chosen)], { mode: 'ai' });
}