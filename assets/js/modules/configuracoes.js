/**
 * configuracoes.js v2 — temas simples, logo URL, fix erro 400
 */

import { db } from '../core/supabase.js';
import { toast, applyTheme } from '../core/ui.js';
import { ge, maskCNPJ, maskCEP, maskWPP, onlyDigits } from '../core/helpers.js';
import State from '../core/state.js';

// Campos de texto — apenas os que existem na tabela
const FIELD_MAP = {
  'cfg-fantasia':   'nome_fantasia',
  'cfg-razao':      'razao_social',
  'cfg-cnpj':       'cnpj',
  'cfg-desc':       'descricao',
  'cfg-emoji':      'logo_emoji',
  'cfg-logo-url':   'logo_url',
  'cfg-cep':        'cep',
  'cfg-logradouro': 'logradouro',
  'cfg-num':        'numero',
  'cfg-bairro':     'bairro',
  'cfg-cidade':     'cidade',
  'cfg-comp':       'complemento',
  'cfg-wpp':        'whatsapp',
  'cfg-tel':        'telefone',
  'cfg-taxa':       'taxa_entrega_padrao',
};

// Temas prontos
const THEMES = [
  { id: 'escuro',    label: '🌑 Escuro',    bg:'#0D0F12', surface:'#141619', card:'#1A1D22', primary:'#4F6EF7', accent:'#E05C5C', text:'#E8EAF0', muted:'#5C6370' },
  { id: 'midnight',  label: '🌌 Midnight',  bg:'#0A0E1A', surface:'#111827', card:'#1C2436', primary:'#6366F1', accent:'#F472B6', text:'#F1F5F9', muted:'#64748B' },
  { id: 'slate',     label: '🪨 Slate',     bg:'#0F172A', surface:'#1E293B', card:'#263248', primary:'#38BDF8', accent:'#FB923C', text:'#F1F5F9', muted:'#94A3B8' },
  { id: 'forest',    label: '🌿 Floresta',  bg:'#0A1A0F', surface:'#122316', card:'#1A3020', primary:'#4ADE80', accent:'#FCD34D', text:'#ECFDF5', muted:'#6EE7B7' },
  { id: 'wine',      label: '🍷 Vinho',     bg:'#160A10', surface:'#231018', card:'#2E1520', primary:'#E879A0', accent:'#FCA5A5', text:'#FFF1F5', muted:'#9D7A83' },
  { id: 'ocean',     label: '🌊 Oceano',    bg:'#070E1A', surface:'#0D1826', card:'#132233', primary:'#0EA5E9', accent:'#34D399', text:'#F0F9FF', muted:'#7EB8D4' },
];

let _selectedTheme = null;

export async function init() {
  _renderThemeGrid();
  const { data } = await db.from('configuracoes').select('*').eq('id', 1).single();
  if (!data) return;
  State.set('config', data);

  Object.entries(FIELD_MAP).forEach(([elId, key]) => {
    const el = ge(elId);
    if (el && data[key] != null) el.value = data[key];
  });

  if (data.logo_url) previewLogo(data.logo_url);

  // Detecta tema atual pelo cor_primary
  if (data.cor_primary) {
    const found = THEMES.find(t => t.primary.toLowerCase() === data.cor_primary.toLowerCase());
    if (found) _selectTheme(found.id, false);
  }
  applyTheme(data);
}

function _renderThemeGrid() {
  const grid = ge('theme-grid');
  if (!grid) return;
  grid.innerHTML = THEMES.map(t => `
    <div id="theme-opt-${t.id}" onclick="Configuracoes.selectTheme('${t.id}')"
      style="padding:12px 8px;border-radius:10px;border:2px solid var(--border);cursor:pointer;
             text-align:center;font-size:12px;font-weight:700;transition:all .2s;
             background:${t.bg};color:${t.text}">
      <div style="display:flex;gap:4px;justify-content:center;margin-bottom:6px">
        <div style="width:14px;height:14px;border-radius:50%;background:${t.primary}"></div>
        <div style="width:14px;height:14px;border-radius:50%;background:${t.accent}"></div>
        <div style="width:14px;height:14px;border-radius:50%;background:${t.surface}"></div>
      </div>
      ${t.label}
    </div>`).join('');
}

export function selectTheme(id) { _selectTheme(id, true); }

function _selectTheme(id, updateVars) {
  const t = THEMES.find(x => x.id === id);
  if (!t) return;
  _selectedTheme = t;

  // Highlight selecionado
  THEMES.forEach(x => {
    const el = ge(`theme-opt-${x.id}`);
    if (el) el.style.borderColor = x.id === id ? t.primary : 'var(--border)';
  });

  // Preview bar
  const bar = ge('theme-preview-bar');
  if (bar) { bar.style.background = t.primary; bar.style.color = '#fff'; bar.textContent = `✨ ${t.label} selecionado`; }

  // Aplica ao vivo
  if (updateVars) {
    const r = document.documentElement.style;
    r.setProperty('--bg',      t.bg);
    r.setProperty('--surface', t.surface);
    r.setProperty('--card',    t.card);
    r.setProperty('--primary', t.primary);
    r.setProperty('--accent',  t.accent);
    r.setProperty('--text',    t.text);
    r.setProperty('--muted',   t.muted);
  }
}

export async function save() {
  const payload = { id: 1 };

  Object.entries(FIELD_MAP).forEach(([elId, key]) => {
    const el = ge(elId);
    if (!el) return;
    if (key === 'whatsapp') payload[key] = onlyDigits(el.value);
    else if (key === 'taxa_entrega_padrao') payload[key] = parseFloat(el.value) || 0;
    else payload[key] = el.value.trim();
  });

  if (_selectedTheme) {
    payload.cor_bg      = _selectedTheme.bg;
    payload.cor_surface = _selectedTheme.surface;
    payload.cor_card    = _selectedTheme.card;
    payload.cor_primary = _selectedTheme.primary;
    payload.cor_accent  = _selectedTheme.accent;
    payload.cor_text    = _selectedTheme.text;
    payload.cor_muted   = _selectedTheme.muted;
  }

  if (!payload.nome_fantasia) { toast('Digite o nome fantasia', 'warn'); return; }
  if (!payload.whatsapp)      { toast('Digite o WhatsApp', 'warn'); return; }

  const { error } = await db.from('configuracoes').upsert(payload);
  if (error) { toast('Erro: ' + error.message, 'error'); console.error(error); return; }

  State.set('config', payload);
  applyTheme(payload);

  const sbName = ge('sb-name'); if (sbName) sbName.textContent = payload.nome_fantasia;
  const sbIcon = ge('sb-icon'); if (sbIcon && payload.logo_emoji) sbIcon.textContent = payload.logo_emoji;

  toast('Configurações salvas! ✅', 'success');
}

export function previewLogo(url) {
  const wrap = ge('logo-preview');
  const img  = ge('logo-preview-img');
  if (!wrap || !img) return;
  if (!url) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  img.src = url;
  img.onerror = () => { wrap.style.display = 'none'; toast('URL da imagem inválida', 'warn'); };
}

export async function fetchCNPJ(raw) {
  const c = onlyDigits(raw);
  if (c.length !== 14) return;
  const spin = ge('cnpj-spin'); if (spin) spin.style.display = 'inline';
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`);
    if (!r.ok) throw new Error();
    const d = await r.json();
    if (ge('cfg-razao')) ge('cfg-razao').value = d.razao_social || '';
    if (!ge('cfg-fantasia').value) ge('cfg-fantasia').value = d.nome_fantasia || d.razao_social || '';
    toast('CNPJ preenchido ✅', 'success');
  } catch { toast('CNPJ não encontrado', 'warn'); }
  if (spin) spin.style.display = 'none';
}

export async function fetchCEP(raw) {
  const c = onlyDigits(raw);
  if (c.length !== 8) return;
  const spin = ge('cep-spin'); if (spin) spin.style.display = 'inline';
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

window.Configuracoes = { save, selectTheme, previewLogo, fetchCNPJ, fetchCEP, maskCNPJ, maskCEP, maskWPP };
