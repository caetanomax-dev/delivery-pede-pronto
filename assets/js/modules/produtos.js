/**
 * produtos.js — Módulo de Produtos (CRUD)
 */

import { db } from '../core/supabase.js';
import { toast, buildModal, openModal, spinnerHTML } from '../core/ui.js';
import { fmt, ge } from '../core/helpers.js';
import State from '../core/state.js';

let _products = [];
let _searchVal = '';

export async function init() {
  await _loadCategories();
  await load();
}

async function _loadCategories() {
  const { data } = await db.from('categorias').select('*').order('ordem');
  State.set('categories', data || []);
  const sel = ge('prod-cat-filter');
  if (!sel) return;
  const cats = State.get('categories');
  sel.innerHTML = '<option value="">Todas as categorias</option>' +
    cats.map(c => `<option value="${c.id}">${c.icone || ''} ${c.nome}</option>`).join('');
}

export async function load() {
  ge('prod-list').innerHTML = spinnerHTML;
  const { data } = await db.from('produtos').select('*,categorias(nome,icone)').order('nome');
  _products = data || [];
  filter();
}

export function filter(search = _searchVal) {
  _searchVal = search ?? '';
  const cat = ge('prod-cat-filter')?.value || '';
  let list = _products;
  if (_searchVal) list = list.filter(p => p.nome.toLowerCase().includes(_searchVal.toLowerCase()) || p.descricao?.toLowerCase().includes(_searchVal.toLowerCase()));
  if (cat) list = list.filter(p => String(p.categoria_id) === String(cat));
  _render(list);
}

function _render(list) {
  const wrap = ge('prod-list');
  const emoji = State.config().logo_emoji || '🏪';
  if (!list.length) { wrap.innerHTML = `<div class="loading-wrap"><p>Nenhum produto encontrado</p></div>`; return; }
  wrap.innerHTML = list.map(p => {
    const ho = p.preco_oferta && p.preco_oferta > 0 && p.preco_oferta < p.preco;
    return `<div class="prod-row" style="${!p.ativo ? 'opacity:.45' : ''}">
      <div class="prod-img">${p.foto_url ? `<img src="${p.foto_url}" onerror="this.parentNode.innerHTML='${emoji}'" loading="lazy"/>` : emoji}</div>
      <div class="prod-info">
        <div class="prod-name">${p.nome}${p.destaque_texto ? ` <span class="badge" style="background:rgba(251,191,36,.15);color:var(--yellow);font-size:10px">${p.destaque_texto}</span>` : ''}</div>
        <div class="prod-price">${ho ? `<span style="text-decoration:line-through;opacity:.5;font-size:12px;color:var(--muted)">${fmt(p.preco)}</span> <span style="color:var(--green)">${fmt(p.preco_oferta)}</span>` : fmt(p.preco)}</div>
        <div class="prod-meta">${p.categorias?.nome ? `${p.categorias.icone || ''} ${p.categorias.nome} · ` : ''}Entrega: ${p.taxa_entrega > 0 ? fmt(p.taxa_entrega) : 'Grátis'} · ${p.ativo ? '<span style="color:var(--green)">🟢 Ativo</span>' : '<span style="color:var(--accent)">🔴 Inativo</span>'}</div>
      </div>
      <div class="prod-actions">
        <label class="tog"><input type="checkbox" ${p.ativo ? 'checked' : ''} onchange="Produtos.toggle(${p.id},this.checked)"/><span class="tog-sl"></span></label>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="Produtos.openForm(${JSON.stringify(p).replace(/"/g, '&quot;')})">✏️</button>
        <button class="btn btn-danger btn-icon btn-sm" onclick="Produtos.del(${p.id})">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

export function openForm(p = null) {
  const cats = State.get('categories');
  const catOpts = cats.map(c => `<option value="${c.id}"${p?.categoria_id === c.id ? ' selected' : ''}>${c.icone || ''} ${c.nome}</option>`).join('');

  openModal(buildModal({
    title: p ? '✏️ Editar Produto' : '➕ Novo Produto',
    body: `
      <div class="field"><label>Nome *</label><input id="pi-nome" value="${p?.nome || ''}" placeholder="Ex: Produto Premium"/></div>
      <div class="field-row">
        <div class="field"><label>Preço (R$) *</label><input id="pi-preco" type="number" step="0.01" value="${p?.preco || ''}" placeholder="0,00"/></div>
        <div class="field"><label>Taxa Entrega (R$)</label><input id="pi-taxa" type="number" step="0.01" value="${p?.taxa_entrega || 0}"/></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Preço de Oferta (R$)</label><input id="pi-oferta" type="number" step="0.01" value="${p?.preco_oferta || ''}" placeholder="Vazio = sem oferta"/></div>
        <div class="field"><label>Texto de Destaque</label><input id="pi-dest" value="${p?.destaque_texto || ''}" placeholder="🔥 NOVO, ⭐ TOP..."/></div>
      </div>
      <div class="field"><label>Categoria</label><select id="pi-cat"><option value="">Sem categoria</option>${catOpts}</select></div>
      <div class="field"><label>URL da Foto</label><input id="pi-foto" value="${p?.foto_url || ''}" placeholder="https://..." oninput="Produtos._prvImg(this.value)"/></div>
      <div id="pi-prev" style="${p?.foto_url ? '' : 'display:none'};margin-top:4px">
        <img src="${p?.foto_url || ''}" style="width:100%;height:160px;object-fit:cover;border-radius:10px;border:1px solid var(--border)" onerror="document.getElementById('pi-prev').style.display='none'"/>
      </div>
      <div class="field"><label>Descrição</label><textarea id="pi-desc" rows="3" placeholder="Descreva o produto...">${p?.descricao || ''}</textarea></div>
      <div style="display:flex;align-items:center;gap:12px">
        <label class="tog"><input id="pi-ativo" type="checkbox" ${p?.ativo !== false ? 'checked' : ''}/><span class="tog-sl"></span></label>
        <span style="font-size:13px;color:var(--muted)">Produto ativo (visível no catálogo)</span>
      </div>`,
    actions: `
      <button class="btn btn-primary" onclick="Produtos.save(${p?.id || 'null'})">💾 Salvar</button>
      <button class="btn btn-ghost" onclick="window.__closeModal()">Cancelar</button>`,
  }));
}

export function _prvImg(url) {
  const p = ge('pi-prev');
  if (!url) { p.style.display = 'none'; return; }
  p.style.display = 'block';
  p.querySelector('img').src = url;
}

export async function save(id) {
  const payload = {
    nome:           ge('pi-nome').value.trim(),
    preco:          parseFloat(ge('pi-preco').value) || 0,
    taxa_entrega:   parseFloat(ge('pi-taxa').value) || 0,
    preco_oferta:   parseFloat(ge('pi-oferta').value) || null,
    destaque_texto: ge('pi-dest').value.trim() || null,
    categoria_id:   ge('pi-cat').value || null,
    foto_url:       ge('pi-foto').value.trim() || null,
    descricao:      ge('pi-desc').value.trim() || null,
    ativo:          ge('pi-ativo').checked,
  };
  if (!payload.nome)  { toast('Digite o nome', 'warn'); return; }
  if (!payload.preco) { toast('Digite o preço', 'warn'); return; }

  const q = id ? db.from('produtos').update(payload).eq('id', id) : db.from('produtos').insert(payload);
  const { error } = await q;
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast(id ? 'Produto atualizado!' : 'Produto criado!', 'success');
  window.__closeModal();
  await load();
}

export async function toggle(id, ativo) {
  await db.from('produtos').update({ ativo }).eq('id', id);
  toast(ativo ? 'Produto ativado' : 'Produto desativado', 'info');
  await load();
}

export async function del(id) {
  if (!confirm('Excluir este produto?')) return;
  await db.from('produtos').delete().eq('id', id);
  toast('Produto excluído', 'success');
  await load();
}

window.Produtos = { load, filter, openForm, save, toggle, del, _prvImg };
