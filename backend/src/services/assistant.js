const STOP_WORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'are', 'can', 'any', 'have', 'has', 'what', 'which', 'who',
  'how', 'that', 'this', 'with', 'want', 'need', 'looking', 'find', 'show', 'give', 'get', 'buy',
  'sell', 'there', 'one', 'some', 'good', 'best', 'cheap', 'cheapest', 'recommend', 'please',
  'below', 'under', 'less', 'than', 'within', 'budget', 'max', 'maximum', 'price', 'cost', 'php',
  'peso', 'pesos', 'shopsmart', 'product', 'products', 'item', 'items', 'something', 'does', 'from'
]);

export const PUBLIC_PRODUCT_FIELDS = { id: true, name: true, description: true, category: true, price: true, stock: true };

export function parseBudget(question) {
  const normalized = question.replaceAll(',', '');
  const match = normalized.match(
    /(?:₱|php\s*|(?:below|under|less than|up to|within|max(?:imum)?|budget(?: of| is)?|cheaper than)\s*₱?\s*)(\d{2,7})(?:\.\d{1,2})?/i
  );
  return match ? Number(match[1]) : null;
}

export function extractTerms(question) {
  return [...new Set(
    question.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 2 && !STOP_WORDS.has(term) && !/^\d+$/.test(term))
      .map((term) => (term.length > 3 && term.endsWith('s') && !term.endsWith('ss') ? term.slice(0, -1) : term))
  )];
}

export function toProductFacts(product) {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    price: Number(product.price),
    stock: product.stock
  };
}

export function rankProducts(products, question) {
  const terms = extractTerms(question);
  const budget = parseBudget(question);
  return products
    .filter((product) => product.active !== false && product.stock > 0)
    .filter((product) => budget === null || Number(product.price) <= budget)
    .map((product) => {
      const name = product.name.toLowerCase();
      const category = product.category.toLowerCase();
      const description = product.description.toLowerCase();
      const score = terms.reduce((total, term) => total
        + (name.includes(term) ? 3 : 0)
        + (category.includes(term) ? 2 : 0)
        + (description.includes(term) ? 1 : 0), 0);
      return { ...product, score };
    })
    .filter((product) => product.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.price) - Number(b.price));
}

export function selectCandidates(products, question, limit = 3) {
  const budget = parseBudget(question);
  const candidates = rankProducts(products, question).slice(0, limit).map(toProductFacts);
  let reason = null;
  if (candidates.length === 0) {
    const anyKeywordMatch = rankProducts(products.map((p) => ({ ...p, stock: 1 })), question.replace(/\d+/g, '')).length > 0;
    reason = anyKeywordMatch ? 'FILTERED' : 'NO_MATCH';
  }
  return { budget, candidates, reason };
}

const peso = (value) => `₱${Number(value).toLocaleString('en-PH')}`;

export function buildRuleBasedAnswer({ candidates, budget, reason }) {
  if (candidates.length === 0) {
    if (reason === 'FILTERED') {
      return budget !== null
        ? `I found related products, but none are in stock at or below ${peso(budget)} right now.`
        : 'I found related products, but none are in stock right now.';
    }
    return 'Sorry, I could not find a product in the current ShopSmart catalog that matches that request.';
  }
  const list = candidates.map((p) => `${p.name} (${peso(p.price)}, ${p.stock} in stock)`).join('; ');
  const budgetText = budget !== null ? ` at or below ${peso(budget)}` : '';
  return `Based on the current ShopSmart catalog, these in-stock products match your request${budgetText}: ${list}.`;
}

export function formatResponse(answer, candidates, extra = {}) {
  return {
    answer,
    recommendedProducts: candidates.map(({ id, name, price, category, stock }) => ({ id, name, price, category, stock })),
    sources: candidates.map(({ id, name }) => ({ type: 'product', id, name })),
    ...extra
  };
}

export function buildAssistantResponse(products, question) {
  const selection = selectCandidates(products, question);
  return formatResponse(buildRuleBasedAnswer(selection), selection.candidates, { mode: 'rules' });
}