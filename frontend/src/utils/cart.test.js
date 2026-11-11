import { describe, expect, it } from 'vitest';
import {
  addProductToCart,
  calculateCartItemCount,
  calculateCartTotal,
  loadCart,
  saveCart,
  updateCartQuantity
} from './cart.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

describe('cart utilities', () => {
  it('calculates the cart total', () => {
    expect(calculateCartTotal([
      { price: 100, quantity: 2 },
      { price: 50, quantity: 3 }
    ])).toBe(350);
  });

  it('adds a new product', () => {
    const result = addProductToCart([], { id: 1, name: 'Mouse', price: 500, stock: 2 });
    expect(result.error).toBe('');
    expect(result.cart[0].quantity).toBe(1);
  });

  it('prevents a quantity above stock', () => {
    const cart = [{ productId: 1, name: 'Mouse', price: 500, stock: 1, quantity: 1 }];
    expect(updateCartQuantity(cart, 1, 2).error).toContain('Only 1');
  });

   it('counts all cart units and handles an empty cart', () => {
    expect(calculateCartItemCount([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
    expect(calculateCartItemCount([])).toBe(0);
  });

  it('keeps the cart after a page refresh', () => {
    const storage = memoryStorage();
    const cart = [{ productId: 1, name: 'Mouse', price: 650, stock: 12, quantity: 2 }];
    saveCart(storage, cart);
    expect(loadCart(storage)).toEqual(cart);
    expect(calculateCartTotal(loadCart(storage))).toBe(1300);
  });

  it('starts with an empty cart when saved data is missing or broken', () => {
    expect(loadCart(memoryStorage())).toEqual([]);
    const storage = memoryStorage();
    storage.setItem('shopsmart-cart', 'not json');
    expect(loadCart(storage)).toEqual([]);
    expect(loadCart(null)).toEqual([]);
  });
});