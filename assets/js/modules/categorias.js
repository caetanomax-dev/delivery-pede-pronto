/**
 * categorias.js — Módulo de Categorias (CRUD)
 */

import { db } from '../core/supabase.js';
import { toast, buildModal, openModal, spinnerHTML } from '../core/ui.js';
import { ge } from '../core/helpers.js';
import State from '../core/state.js';

export async function init() {
  await load();
}

export async function load() {
  ge('cat-list').innerHTML = spinnerHTML;
  const { data } = await db.from('categorias').select('*').order('ordem');
  State.set('categories', data || []);
  _render();
}

function _render() {
  const list = State.get('categories');
  const wrap = ge('cat-list');
  if (!list.length) { wrap.innerHTML = `<div class="loading-wrap"><p>Nenhuma categoria ainda.</p></div>`; return; }
  wrap.innerHTML = list.map(c => `
    <div class="prod-row">
      <div style="width:46px;height:46px;background:var(--primary-dim);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${c.icone || '🏷️'}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px;color:var(--text)">${c.nome}</div>
        <div style="font-size:12px;color:var(--muted)">Ordem: ${c.ordem}</div>
      </div>
      <div class="prod-actions">
        <button class="btn btn-ghost btn-icon btn-sm" onclick="Categorias.openForm(${JSON.stringify(c).replace(/"/g,'&quot;')})">✏️</button>
        <button class="btn btn-danger btn-icon btn-sm" onclick="Categorias.del(${c.id})">🗑️</button>
      </div>
    </div>`).join('');
}

export function openForm(c = null) {
  const cats = State.get('categories');
  openModal(buildModal({
    title: c ? '✏️ Editar Categoria' : '➕ Nova Categoria',
    body: `
      <div class="field"><label>Nome *</label><input id="ci-nome" value="${c?.nome || ''}" placeholder="Ex: Lanches"/></div>
      <div class="field-row">
        <div class="field"><label>Emoji / Ícone</label><input id="ci-icone" value="${c?.icone || ''}" placeholder="🍔" maxlength="4"/></div>
        <div class="field"><label>Ordem</label><input id="ci-ordem" type="number" value="${c?.ordem || cats.length + 1}"/></div>
      </div>`,
    actions: `
      <button class="btn btn-primary" onclick="Categorias.save(${c?.id || 'null'})">💾 Salvar</button>
      <button class="btn btn-ghost" onclick="window.__closeModal()">Cancelar</button>`,
  }));
}

export async function save(id) {
  const payload = {
    nome:  ge('ci-nome').value.trim(),
    icone: ge('ci-icone').value.trim() || '🏷️',
    ordem: parseInt(ge('ci-ordem').value) || 1,
  };
  if (!payload.nome) { toast('Digite o nome', 'warn'); return; }
  const q = id ? db.from('categorias').update(payload).eq('id', id) : db.from('categorias').insert(payload);
  const { error } = await q;
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast(id ? 'Atualizada!' : 'Criada!', 'success');
  window.__closeModal();
  await load();
}

export async function del(id) {
  if (!confirm('Excluir esta categoria?')) return;
  await db.from('categorias').delete().eq('id', id);
  toast('Excluída', 'success');
  await load();
}

window.Categorias = { load, openForm, save, del };
