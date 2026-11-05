import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssistantResponse, extractTerms, parseBudget, rankProducts, selectCandidates } from '../src/services/assistant.js';

const products = [
  { id: 1, name: 'Wireless Mouse', category: 'Accessories', description: 'Quiet wireless mouse with adjustable sensitivity and USB receiver.', price: 650, stock: 12 },
  { id: 2, name: 'Compact Mechanical Keyboard', category: 'Accessories', description: 'Hot-swappable compact keyboard with tactile switches.', price: 1850, stock: 8 },
  { id: 3, name: 'USB-C Study Lamp', category: 'Study', description: 'Adjustable desk lamp with three brightness levels.', price: 900, stock: 10 },
  { id: 5, name: 'Laptop Stand', category: 'Study', description: 'Foldable aluminum stand for laptops up to 16 inches.', price: 1200, stock: 9 },
  { id: 90, name: 'Test Gaming Keyboard', category: 'Accessories', description: 'Disposable test keyboard.', price: 1500, stock: 0 },
  { id: 91, name: 'Inactive Keyboard', category: 'Accessories', description: 'Hidden keyboard.', price: 1000, stock: 5, active: false }
];

test('parseBudget extracts a peso budget', () => assert.equal(parseBudget('below ₱2,000'), 2000));
test('parseBudget ignores model numbers', () => assert.equal(parseBudget('Is there a G502 mouse?'), null));
test('extractTerms drops stop words and handles plurals', () => assert.deepEqual(extractTerms('Which keyboards are below ₱2,000?'), ['keyboard']));
test('rankProducts respects the budget', () => assert.deepEqual(rankProducts(products, 'mouse below 700').map((p) => p.id), [1]));

test('catalog match: keyboard below ₱2,000 returns only the real in-stock keyboard', () => {
  const result = buildAssistantResponse(products, 'Which keyboard is below ₱2,000?');
  assert.deepEqual(result.recommendedProducts.map((p) => p.id), [2]);
  assert.equal(result.recommendedProducts[0].price, 1850);
  assert.match(result.answer, /₱1,850/);
});

test('no match: absent category returns no products or sources', () => {
  const result = buildAssistantResponse(products, 'Do you sell printers?');
  assert.deepEqual(result.recommendedProducts, []);
  assert.deepEqual(result.sources, []);
  assert.match(result.answer, /could not find/i);
});

test('availability: out-of-stock and inactive products are never recommended', () => {
  const ids = buildAssistantResponse(products, 'keyboard').recommendedProducts.map((p) => p.id);
  assert.ok(!ids.includes(90));
  assert.ok(!ids.includes(91));
});

test('over budget: honest message instead of a product', () => {
  const selection = selectCandidates(products, 'keyboard under ₱500');
  assert.equal(selection.candidates.length, 0);
  assert.equal(selection.reason, 'FILTERED');
});

test('sources match recommended products', () => {
  const result = buildAssistantResponse(products, 'keyboard');
  assert.deepEqual(result.sources.map((s) => s.id), result.recommendedProducts.map((p) => p.id));
});