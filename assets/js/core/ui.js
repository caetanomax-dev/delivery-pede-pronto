/**
 * ui.js — Utilitários de interface
 * Toast, Modal, Spinner, Theme.
 * Não contém lógica de negócio.
 */

import { ge } from './helpers.js';

// ─── TOAST ───────────────────────────────────────────────────────────────────

const TOAST_COLORS = { success: 'var(--green)', error: 'var(--accent)', info: 'var(--primary)', warn: 'var(--accent2)' };
const TOAST_ICONS  = { success: '✅', error: '❌', info: '🔔', warn: '⚠️' };

export function toast(msg, type = 'info') {
  const wrap = ge('toast-wrap');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.style.borderLeft = `3px solid ${TOAST_COLORS[type]}`;
  t.innerHTML = `<span>${TOAST_ICONS[type]}</span><span>${msg}</span>`;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ─── MODAL ───────────────────────────────────────────────────────────────────

export function openModal(html) {
  const wrap = ge('modal-wrap');
  if (!wrap) return;
  wrap.innerHTML = html;
}

export function closeModal() {
  const wrap = ge('modal-wrap');
  if (wrap) wrap.innerHTML = '';
}

/** Wrapper para modal padrão com overlay */
export function buildModal({ title, body, actions = '' } = {}) {
  return `
  <div class="modal-overlay" onclick="if(event.target===this)window.__closeModal()">
    <div class="modal-box">
      <div class="modal-head">
        <div class="modal-title">${title}</div>
        <button class="modal-close" onclick="window.__closeModal()">✕</button>
      </div>
      ${body}
      ${actions ? `<div class="modal-actions">${actions}</div>` : ''}
    </div>
  </div>`;
}

// Expõe closeModal globalmente para uso em onclick inline dos modais
window.__closeModal = closeModal;

// ─── SPINNER ─────────────────────────────────────────────────────────────────

export const spinnerHTML = `<div class="loading-wrap"><div class="spinner"></div></div>`;

// ─── TEMA ────────────────────────────────────────────────────────────────────

const THEME_MAP = [
  { db: 'cor_bg',      css: '--bg'      },
  { db: 'cor_surface', css: '--surface'  },
  { db: 'cor_card',    css: '--card'     },
  { db: 'cor_primary', css: '--primary'  },
  { db: 'cor_accent',  css: '--accent'   },
  { db: 'cor_text',    css: '--text'     },
  { db: 'cor_muted',   css: '--muted'    },
];

export function applyTheme(cfg) {
  if (!cfg) return;
  const r = document.documentElement.style;
  THEME_MAP.forEach(({ db, css }) => {
    if (cfg[db] && /^#[0-9A-Fa-f]{3,8}$/.test(cfg[db].trim())) {
      r.setProperty(css, cfg[db].trim());
    }
  });
}

// ─── SKELETON ────────────────────────────────────────────────────────────────

export function skeletonCard(n = 4) {
  return Array.from({ length: n }, () => `<div class="skeleton-card"></div>`).join('');
}
