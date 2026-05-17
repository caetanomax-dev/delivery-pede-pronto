/**
 * storage.js — Helpers de localStorage para o cardápio público
 * Isola todo acesso a storage. Nunca usar localStorage diretamente nos módulos.
 */

const CART_KEY = 'dos_cart';
const DELIVERY_KEY = 'dos_delivery_fee';

export const CartStorage = {
  get: () => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
  },
  set: (items) => localStorage.setItem(CART_KEY, JSON.stringify(items)),
  clear: () => localStorage.removeItem(CART_KEY),
};

export const DeliveryStorage = {
  get: () => parseFloat(localStorage.getItem(DELIVERY_KEY) || '0'),
  set: (fee) => localStorage.setItem(DELIVERY_KEY, String(fee)),
  clear: () => localStorage.removeItem(DELIVERY_KEY),
};
