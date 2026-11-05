import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, extractPrices, verifyDraft } from '../src/services/groundedAnswer.js';
import { draftWithGemini, parseDraft } from '../src/services/gemini.js';

const products = [
  { id: 1, name: 'Wireless Mouse', category: 'Accessories', description: 'Quiet wireless mouse.', price: 650, stock: 12 },
  { id: 2, name: 'Compact Mechanical Keyboard', category: 'Accessories', description: 'Hot-swappable compact keyboard with tactile switches.', price: 1850, stock: 8 },
  { id: 90, name: 'Test Gaming Keyboard', category: 'Accessories', description: 'Disposable test keyboard.', price: 1500, stock: 0 }
];
const question = 'Which keyboard is below ₱2,000?';
const goodDraft = { answer: 'The Compact Mechanical Keyboard is ₱1,850 and in stock, within your ₱2,000 budget.', productIds: [2] };

test('verified AI draft is returned with valid ids', async () => {
  const result = await answerQuestion(products, question, { provider: async () => goodDraft });
  assert.equal(result.mode, 'ai');
  assert.deepEqual(result.recommendedProducts.map((p) => p.id), [2]);
  assert.deepEqual(result.sources.map((s) => s.id), [2]);
});

test('no match does not call the provider', async () => {
  let called = false;
  const result = await answerQuestion(products, 'Do you sell printers?', { provider: async () => { called = true; return goodDraft; } });
  assert.equal(called, false);
  assert.equal(result.mode, 'no-match');
  assert.deepEqual(result.recommendedProducts, []);
});

test('invented product id is rejected and replaced by fallback', async () => {
  const result = await answerQuestion(products, question, { provider: async () => ({ answer: 'Try the Ultra Keyboard.', productIds: [999] }) });
  assert.equal(result.mode, 'fallback');
  assert.deepEqual(result.recommendedProducts.map((p) => p.id), [2]);
});

test('out-of-stock product id from the model is rejected', async () => {
  const result = await answerQuestion(products, question, { provider: async () => ({ answer: 'Try the Test Gaming Keyboard.', productIds: [90] }) });
  assert.equal(result.mode, 'fallback');
});

test('wrong price claim is rejected', () => {
  const check = verifyDraft({ answer: 'The keyboard costs ₱1,500.', productIds: [2] }, { candidates: [{ ...products[1] }], budget: 2000 });
  assert.equal(check.ok, false);
});

test('false availability claim is rejected', () => {
  const check = verifyDraft({ answer: 'The keyboard at ₱1,850 is out of stock.', productIds: [2] }, { candidates: [{ ...products[1] }], budget: 2000 });
  assert.equal(check.ok, false);
});

test('provider failure falls back to rule-based answer', async () => {
  const result = await answerQuestion(products, question, { provider: async () => { const e = new Error('down'); e.code = 'UNAVAILABLE'; throw e; } });
  assert.equal(result.mode, 'fallback');
  assert.match(result.notice, /unavailable/i);
  assert.match(result.answer, /₱1,850/);
});

test('missing API key falls back without calling the network', async () => {
  const result = await answerQuestion(products, question, { provider: (input) => draftWithGemini(input, { apiKey: '' }) });
  assert.equal(result.mode, 'fallback');
});

test('provider timeout falls back', async () => {
  const slowFetch = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const result = await answerQuestion(products, question, { provider: (input) => draftWithGemini(input, { apiKey: 'test', timeoutMs: 20, fetchImpl: slowFetch }) });
  assert.equal(result.mode, 'fallback');
  assert.match(result.notice, /too long/i);
});

test('rate limit (429) falls back', async () => {
  const fetch429 = async () => ({ status: 429, ok: false, json: async () => ({}) });
  const result = await answerQuestion(products, question, { provider: (input) => draftWithGemini(input, { apiKey: 'test', fetchImpl: fetch429 }) });
  assert.match(result.notice, /busy/i);
});

test('malformed provider output is rejected', () => assert.throws(() => parseDraft('not json'), { code: 'INVALID_FORMAT' }));
test('extractPrices reads peso amounts', () => assert.deepEqual(extractPrices('₱1,850 and PHP 2000'), [1850, 2000]));