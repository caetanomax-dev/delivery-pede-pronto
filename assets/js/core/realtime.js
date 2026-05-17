/**
 * realtime.js — Gerenciador de conexão Realtime com Supabase
 * Auto-reconexão, retry inteligente, canal único por contexto.
 */

import { db } from './supabase.js';
import { NOTIF_SOUND_URL } from './config.js';

let _channel = null;
let _audio = null;
let _reconnectTimer = null;

function getAudio() {
  if (!_audio) _audio = new Audio(NOTIF_SOUND_URL);
  return _audio;
}

export function playNotif() {
  try { getAudio().play(); } catch (_) {}
}

/**
 * Inicia canal realtime para a tabela `pedidos`.
 * @param {Object} handlers - { onInsert, onUpdate }
 */
export function startOrdersRealtime({ onInsert, onUpdate } = {}) {
  _teardown();

  _channel = db
    .channel('admin-orders-' + Date.now())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, (payload) => {
      playNotif();
      if (onInsert) onInsert(payload.new);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos' }, (payload) => {
      if (onUpdate) onUpdate(payload.new);
    })
    .subscribe((status) => {
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        _scheduleReconnect({ onInsert, onUpdate });
      }
    });
}

/**
 * Inicia canal realtime para um pedido específico (tracking cliente).
 * @param {number} orderId
 * @param {Function} onUpdate
 */
export function startTrackRealtime(orderId, onUpdate) {
  _teardown();
  _channel = db
    .channel(`track-${orderId}-${Date.now()}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${orderId}`,
    }, (p) => onUpdate && onUpdate(p.new))
    .subscribe();
}

export function stopRealtime() {
  _teardown();
}

function _teardown() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_channel) { try { _channel.unsubscribe(); } catch (_) {} _channel = null; }
}

function _scheduleReconnect(handlers) {
  _reconnectTimer = setTimeout(() => startOrdersRealtime(handlers), 5000);
}
