const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function buildPrompt(question, candidates, budget) {
  const facts = candidates.map(({ id, name, description, category, price, stock }) => ({ id, name, description, category, price, stock }));
  return [
    'Customer question:',
    question,
    '',
    `Customer budget in PHP: ${budget ?? 'not stated'}`,
    '',
    'Catalog products (JSON). These are the ONLY facts you may use:',
    JSON.stringify(facts),
    '',
    'Reply with JSON only, in this exact shape:',
    '{"answer": "<2-3 sentence answer>", "productIds": [<ids of products you recommend>]}'
  ].join('\n');
}

const SYSTEM_INSTRUCTION = [
  'You are the ShopSmart product assistant.',
  'Use only the catalog products given. Never invent products, specifications, prices, stock levels, discounts, or delivery details.',
  'Write prices exactly as given, in the format ₱1,850.',
  'Only recommend ids from the given list. If none fit the question, return an empty productIds list and say so.',
  'Keep the answer under 80 words. Do not place orders or ask for personal information.'
].join(' ');

export function parseDraft(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new ProviderError('INVALID_FORMAT', 'Provider reply was not valid JSON.');
  }
  if (typeof data?.answer !== 'string' || !Array.isArray(data?.productIds)) {
    throw new ProviderError('INVALID_FORMAT', 'Provider reply is missing answer or productIds.');
  }
  return { answer: data.answer.trim(), productIds: data.productIds.map(Number) };
}

export async function draftWithGemini({ question, candidates, budget }, options = {}) {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  const model = options.model ?? process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
  const timeoutMs = Number(options.timeoutMs ?? process.env.GEMINI_TIMEOUT_MS ?? 8000);
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiKey) throw new ProviderError('NOT_CONFIGURED', 'GEMINI_API_KEY is not set.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ parts: [{ text: buildPrompt(question, candidates, budget) }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2048 }
      })
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new ProviderError('TIMEOUT', `Provider did not answer within ${timeoutMs} ms.`);
    throw new ProviderError('UNAVAILABLE', 'Provider could not be reached.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) throw new ProviderError('RATE_LIMITED', 'Provider rate limit reached.');
  if (!response.ok) throw new ProviderError('UNAVAILABLE', `Provider returned HTTP ${response.status}.`);

  const data = await response.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
  return parseDraft(text);
}