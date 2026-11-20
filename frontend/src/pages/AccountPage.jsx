import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';

export default function AccountPage() {
  const { user, checking, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    api.getMyOrders()
      .then((data) => setOrders(data.orders))
      .catch((caught) => setError(caught.message))
      .finally(() => setLoading(false));
  }, [user]);

  if (checking) return <section><StatusMessage>Checking your sign-in…</StatusMessage></section>;
  if (!user) return <Navigate to="/login" replace state={{ from: '/account' }} />;

  return (
    <section>
      <div className="page-heading"><p className="eyebrow">MY ACCOUNT</p><h1>{user.name}</h1><p>{user.email}</p></div>
      <button type="button" className="button secondary" onClick={logout}>Sign out</button>
      <h2>My orders</h2>
      {loading && <StatusMessage>Loading your orders…</StatusMessage>}
      <StatusMessage type="error">{error}</StatusMessage>
      {!loading && !error && orders.length === 0 && <div className="empty-state"><p>You have no orders yet.</p><Link className="button" to="/">Browse products</Link></div>}
      <div className="cart-items">
        {orders.map((order) => (
          <article className="cart-item" key={order.id}>
            <div>
              <h2>Order #{order.id}</h2>
              <p>{new Date(order.createdAt).toLocaleString('en-PH')}</p>
              <p>{order.items.map((item) => `${item.quantity} × ${item.name}`).join(', ')}</p>
            </div>
            <strong>₱{order.total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
