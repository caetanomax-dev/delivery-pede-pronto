/**
 * configuracoes.js — Módulo de Configurações da loja
 */

import { db } from '../core/supabase.js';
import { toast, applyTheme } from '../core/ui.js';
import { ge, maskCNPJ, maskCEP, maskWPP, onlyDigits } from '../core/helpers.js';
import State from '../core/state.js';

const FIELD_MAP = {
  'cfg-fantasia': 'nome_fantasia', 'cfg-razao': 'razao_social', 'cfg-cnpj': 'cnpj',
  'cfg-ie': 'ie', 'cfg-desc': 'descricao', 'cfg-emoji': 'logo_emoji',
  'cfg-cep': 'cep', 'cfg-logradouro': 'logradouro', 'cfg-num': 'numero',
  'cfg-bairro': 'bairro', 'cfg-cidade': 'cidade', 'cfg-comp': 'complemento',
  'cfg-wpp': 'whatsapp', 'cfg-tel': 'telefone',
};

const THEME_MAP = {
  'cor_bg': 't-bg', 'cor_surface': 't-surface', 'cor_card': 't-card',
  'cor_primary': 't-primary', 'cor_accent': 't-accent',
  'cor_text': 't-text', 'cor_muted': 't-muted',
};

export async function init() {
  const { data } = await db.from('configuracoes').select('*').eq('id', 1).single();
  if (!data) return;
  State.set('config', data);

  Object.entries(FIELD_MAP).forEach(([elId, key]) => {
    const el = ge(elId);
    if (el && data[key] != null) el.value = data[key];
  });

  Object.entries(THEME_MAP).forEach(([key, id]) => {
    if (data[key]) {
      const p = ge(id); const t = ge(id + '-txt');
      if (p) p.value = data[key];
      if (t) t.value = data[key];
    }
  });

  applyTheme(data);
}

export async function save() {
  const payload = { id: 1 };
  Object.entries(FIELD_MAP).forEach(([elId, key]) => {
    const el = ge(elId);
    if (el) payload[key] = key === 'whatsapp' ? onlyDigits(el.value) : el.value.trim();
  });

  Object.entries(THEME_MAP).forEach(([key, id]) => {
    const p = ge(id);
    if (p) payload[key] = p.value;
  });

  if (!payload.nome_fantasia) { toast('Digite o nome fantasia', 'warn'); return; }
  if (!payload.whatsapp)      { toast('Digite o WhatsApp', 'warn'); return; }

  const { error } = await db.from('configuracoes').upsert(payload);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  State.set('config', payload);
  applyTheme(payload);

  // Atualiza sidebar
  const sbName = ge('sb-name'); if (sbName) sbName.textContent = payload.nome_fantasia;
  const sbIcon = ge('sb-icon'); if (sbIcon && payload.logo_emoji) sbIcon.textContent = payload.logo_emoji;

  toast('Configurações salvas! ✅', 'success');
}

export function liveTheme() {
  const r = document.documentElement.style;
  const keys = ['bg', 'surface', 'card', 'primary', 'accent', 'text', 'muted'];
  keys.forEach(k => {
    const val = ge(`t-${k}`)?.value;
    if (val) {
      r.setProperty(`--${k}`, val);
      const txt = ge(`t-${k}-txt`); if (txt) txt.value = val;
    }
  });
  const prev = ge('theme-prev');
  if (prev) prev.style.background = ge('t-primary')?.value || '#6C63FF';
}

export function syncColor(picId, txtId) {
  const v = ge(txtId)?.value;
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) { const p = ge(picId); if (p) p.value = v; liveTheme(); }
}

export function resetTheme() {
  const d = { bg: '#0B0C0E', surface: '#13151A', card: '#1C1F27', primary: '#6C63FF', accent: '#FF6B6B', text: '#F1F2F6', muted: '#6B7280' };
  Object.entries(d).forEach(([k, v]) => {
    const p = ge(`t-${k}`); if (p) p.value = v;
    const t = ge(`t-${k}-txt`); if (t) t.value = v;
  });
  liveTheme();
  toast('Tema restaurado', 'info');
}

export async function fetchCNPJ(raw) {
  const c = onlyDigits(raw);
  if (c.length !== 14) return;
  ge('cnpj-spin').style.display = 'inline';
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`);
    if (!r.ok) throw new Error();
    const d = await r.json();
    if (ge('cfg-razao')) ge('cfg-razao').value = d.razao_social || '';
    if (!ge('cfg-fantasia').value) ge('cfg-fantasia').value = d.nome_fantasia || d.razao_social || '';
    if (d.cep && ge('cfg-cep')) ge('cfg-cep').value = d.cep.replace(/(\d{5})(\d{3})/, '$1-$2');
    if (d.logradouro && ge('cfg-logradouro')) ge('cfg-logradouro').value = d.logradouro;
    if (d.numero && ge('cfg-num')) ge('cfg-num').value = d.numero;
    if (d.bairro && ge('cfg-bairro')) ge('cfg-bairro').value = d.bairro;
    if (d.municipio && d.uf && ge('cfg-cidade')) ge('cfg-cidade').value = `${d.municipio} / ${d.uf}`;
    toast('CNPJ preenchido ✅', 'success');
  } catch { toast('CNPJ não encontrado', 'warn'); }
  ge('cnpj-spin').style.display = 'none';
}

export async function fetchCEP(raw) {
  const c = onlyDigits(raw);
  if (c.length !== 8) return;
  ge('cep-spin').style.display = 'inline';
  try {
    const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
    const d = await r.json();
    if (d.erro) throw new Error();
    if (ge('cfg-logradouro')) ge('cfg-logradouro').value = d.logradouro || '';
    if (ge('cfg-bairro'))     ge('cfg-bairro').value     = d.bairro || '';
    if (ge('cfg-cidade'))     ge('cfg-cidade').value     = d.localidade && d.uf ? `${d.localidade} / ${d.uf}` : '';
    toast('CEP preenchido ✅', 'success');
  } catch { toast('CEP não encontrado', 'warn'); }
  ge('cep-spin').style.display = 'none';
}

window.Configuracoes = { save, liveTheme, syncColor, resetTheme, fetchCNPJ, fetchCEP, maskCNPJ, maskCEP, maskWPP };
