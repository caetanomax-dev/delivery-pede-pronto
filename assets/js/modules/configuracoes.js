/**
 * configuracoes.js — Módulo de Configurações
 * Corrigido: mapeamento de cores, taxa de entrega, fetchCNPJ/CEP
 */

import { db } from '../core/supabase.js';
import { toast, applyTheme } from '../core/ui.js';
import { ge, maskCNPJ, maskCEP, maskWPP, onlyDigits } from '../core/helpers.js';
import State from '../core/state.js';

const FIELD_MAP = {
  'cfg-fantasia':  'nome_fantasia',
  'cfg-razao':     'razao_social',
  'cfg-cnpj':      'cnpj',
  'cfg-ie':        'ie',
  'cfg-desc':      'descricao',
  'cfg-emoji':     'logo_emoji',
  'cfg-cep':       'cep',
  'cfg-logradouro':'logradouro',
  'cfg-num':       'numero',
  'cfg-bairro':    'bairro',
  'cfg-cidade':    'cidade',
  'cfg-comp':      'complemento',
  'cfg-wpp':       'whatsapp',
  'cfg-tel':       'telefone',
  'cfg-taxa':      'taxa_entrega_padrao',
};

// Mapeamento cor → variável CSS e input id
const THEME_KEYS = [
  { db: 'cor_bg',      id: 't-bg',      css: '--bg'      },
  { db: 'cor_surface', id: 't-surface', css: '--surface'  },
  { db: 'cor_card',    id: 't-card',    css: '--card'     },
  { db: 'cor_primary', id: 't-primary', css: '--primary'  },
  { db: 'cor_accent',  id: 't-accent',  css: '--accent'   },
  { db: 'cor_text',    id: 't-text',    css: '--text'     },
  { db: 'cor_muted',   id: 't-muted',   css: '--muted'    },
];

export async function init() {
  const { data } = await db.from('configuracoes').select('*').eq('id', 1).single();
  if (!data) return;
  State.set('config', data);

  // Preenche campos de texto
  Object.entries(FIELD_MAP).forEach(([elId, key]) => {
    const el = ge(elId);
    if (el && data[key] != null) el.value = data[key];
  });

  // Preenche cores
  THEME_KEYS.forEach(({ db: key, id }) => {
    if (!data[key]) return;
    const pic = ge(id);
    const txt = ge(id + '-txt');
    if (pic) pic.value = data[key];
    if (txt) txt.value = data[key];
  });

  // Aplica tema atual
  applyTheme(data);
  _updatePreview();
}

export async function save() {
  const payload = { id: 1 };

  // Campos de texto
  Object.entries(FIELD_MAP).forEach(([elId, key]) => {
    const el = ge(elId);
    if (!el) return;
    payload[key] = key === 'whatsapp' ? onlyDigits(el.value) : el.value.trim();
  });

  // Cores
  THEME_KEYS.forEach(({ db: key, id }) => {
    const pic = ge(id);
    if (pic) payload[key] = pic.value;
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
  THEME_KEYS.forEach(({ id, css }) => {
    const val = ge(id)?.value;
    if (val) {
      r.setProperty(css, val);
      const txt = ge(id + '-txt');
      if (txt) txt.value = val;
    }
  });
  _updatePreview();
}

export function syncColor(picId, txtId) {
  const v = ge(txtId)?.value;
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
    const p = ge(picId);
    if (p) p.value = v;
    liveTheme();
  }
}

export function resetTheme() {
  const defaults = {
    't-bg':      '#0D0F12',
    't-surface': '#141619',
    't-card':    '#1A1D22',
    't-primary': '#4F6EF7',
    't-accent':  '#E05C5C',
    't-text':    '#E8EAF0',
    't-muted':   '#5C6370',
  };
  Object.entries(defaults).forEach(([id, v]) => {
    const p = ge(id);      if (p) p.value = v;
    const t = ge(id+'-txt'); if (t) t.value = v;
  });
  liveTheme();
  toast('Tema restaurado', 'info');
}

function _updatePreview() {
  const prev = ge('theme-prev');
  if (prev) prev.style.background = ge('t-primary')?.value || '#4F6EF7';
}

export async function fetchCNPJ(raw) {
  const c = onlyDigits(raw);
  if (c.length !== 14) return;
  const spin = ge('cnpj-spin');
  if (spin) spin.style.display = 'inline';
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`);
    if (!r.ok) throw new Error();
    const d = await r.json();
    if (ge('cfg-razao'))    ge('cfg-razao').value    = d.razao_social || '';
    if (!ge('cfg-fantasia').value) ge('cfg-fantasia').value = d.nome_fantasia || d.razao_social || '';
    if (d.cep && ge('cfg-cep'))   ge('cfg-cep').value = d.cep.replace(/(\d{5})(\d{3})/, '$1-$2');
    if (d.logradouro && ge('cfg-logradouro')) ge('cfg-logradouro').value = d.logradouro;
    if (d.numero && ge('cfg-num'))   ge('cfg-num').value = d.numero;
    if (d.bairro && ge('cfg-bairro')) ge('cfg-bairro').value = d.bairro;
    if (d.municipio && d.uf && ge('cfg-cidade')) ge('cfg-cidade').value = `${d.municipio} / ${d.uf}`;
    toast('CNPJ preenchido ✅', 'success');
  } catch { toast('CNPJ não encontrado', 'warn'); }
  if (spin) spin.style.display = 'none';
}

export async function fetchCEP(raw) {
  const c = onlyDigits(raw);
  if (c.length !== 8) return;
  const spin = ge('cep-spin');
  if (spin) spin.style.display = 'inline';
  try {
    const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
    const d = await r.json();
    if (d.erro) throw new Error();
    if (ge('cfg-logradouro')) ge('cfg-logradouro').value = d.logradouro || '';
    if (ge('cfg-bairro'))     ge('cfg-bairro').value     = d.bairro || '';
    if (ge('cfg-cidade'))     ge('cfg-cidade').value     = d.localidade && d.uf ? `${d.localidade} / ${d.uf}` : '';
    toast('CEP preenchido ✅', 'success');
  } catch { toast('CEP não encontrado', 'warn'); }
  if (spin) spin.style.display = 'none';
}

window.Configuracoes = { save, liveTheme, syncColor, resetTheme, fetchCNPJ, fetchCEP, maskCNPJ, maskCEP, maskWPP };
