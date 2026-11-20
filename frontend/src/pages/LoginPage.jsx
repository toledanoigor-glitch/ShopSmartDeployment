import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const next = location.state?.from || '/account';

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') await login({ email: form.email, password: form.password });
      else await register(form);
      navigate(next, { replace: true });
    } catch (caught) {
      setError(caught.status ? caught.message : 'Could not reach ShopSmart. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="checkout-layout">
      <form onSubmit={submit}>
        <p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'NEW CUSTOMER'}</p>
        <h1>{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
        <StatusMessage type="error">{error}</StatusMessage>
        {mode === 'register' && <label>Full name<input name="name" value={form.name} onChange={updateField} minLength="2" maxLength="80" required /></label>}
        <label>Email address<input name="email" type="email" value={form.email} onChange={updateField} required /></label>
        <label>Password<input name="password" type="password" value={form.password} onChange={updateField} minLength={mode === 'register' ? 8 : 1} maxLength="72" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>
        <button disabled={submitting}>{submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="button secondary" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
        </button>
      </form>
      <aside className="summary">
        <h2>Demo accounts only</h2>
        <p>ShopSmart is a classroom project. Use a fictional name and email, and a password you do not use anywhere else.</p>
      </aside>
    </section>
  );
}
