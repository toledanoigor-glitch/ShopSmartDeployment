import React from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { api } from '../services/api.js';

const MODE_LABELS = {
  ai: 'AI-drafted answer, checked against the current catalog',
  fallback: 'Catalog answer (AI helper not used)',
  'no-match': 'Catalog search: no matching product',
  rules: 'Catalog answer'
};

function readableError(caught) {
  if (caught.status === 429) return 'Too many questions in a short time. Please wait a minute and try again.';
  if (caught.status === 422) return caught.message;
  if (!caught.status) return 'Could not reach ShopSmart. Check that the server is running, then try again.';
  return 'The assistant could not answer right now. Please try again.';
}

export default function AssistantPage() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function ask(event) {
    event.preventDefault(); setError(''); setResult(null); setLoading(true);
    try { setResult(await api.askAssistant(question)); }
    catch (caught) { setError(readableError(caught)); }
    finally { setLoading(false); }
  }

  return (
    <section className="assistant-layout">
      <div>
        <p className="eyebrow">GROUNDED ASSISTANT</p>
        <h1>Find a product</h1>
        <p>Answers use only current ShopSmart catalog facts. Every recommended product links to its product page.</p>
        <form onSubmit={ask}>
          <label>Your question<textarea value={question} onChange={(event) => setQuestion(event.target.value)} minLength="3" maxLength="300" placeholder="Which keyboard is below ₱2,000?" required /></label>
          <button disabled={loading}>{loading ? 'Checking the catalog…' : 'Ask ShopSmart'}</button>
        </form>
      </div>
      <div className="assistant-answer" aria-live="polite">
        <h2>Assistant response</h2>
        {loading && <StatusMessage>Searching the catalog and preparing an answer…</StatusMessage>}
        <StatusMessage type="error">{error}</StatusMessage>
        {!result && !error && !loading && <p>Your answer will appear here.</p>}
        {result && <>
          <StatusMessage>{result.notice}</StatusMessage>
          <p>{result.answer}</p>
          {result.recommendedProducts.length > 0 && (
            <div className="recommendations">
              {result.recommendedProducts.map((product) => (
                <Link key={product.id} to={`/products/${product.id}`}>
                  {product.name} — ₱{Number(product.price).toLocaleString('en-PH')}
                  {product.stock !== undefined && ` · ${product.stock} in stock`}
                </Link>
              ))}
            </div>
          )}
          <details>
            <summary>Sources ({result.sources.length})</summary>
            {result.sources.length === 0
              ? <p>No catalog product matched, so no sources were used.</p>
              : <ul>{result.sources.map((source) => (
                <li key={source.id}><Link to={`/products/${source.id}`}>Product #{source.id}: {source.name}</Link></li>
              ))}</ul>}
          </details>
          {result.mode && <p><small>{MODE_LABELS[result.mode] || result.mode}</small></p>}
        </>}
      </div>
    </section>
  );
}