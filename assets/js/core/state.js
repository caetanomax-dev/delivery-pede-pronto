/**
 * state.js — Estado global do admin
 * Contém apenas dados. Nunca lógica de UI aqui.
 *
 * Regra: módulos lêem e escrevem via State.get/set.
 * Isso facilita debug e evita variáveis globais espalhadas.
 */

const _state = {
  config: {},
  categories: [],
  products: [],
  orders: { recebido: [], aceito: [], preparando: [], entrega: [] },
  finalizados: [],
  newCount: 0,
  currentPage: 'pedidos',
  histPage: 0,
  histPerPage: 10,
};

export const State = {
  get: (key) => _state[key],
  set: (key, value) => { _state[key] = value; },
  update: (key, fn) => { _state[key] = fn(_state[key]); },
  /** Atalho para config */
  config: () => _state.config,
};

export default State;
