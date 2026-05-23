/**
 * categorias.js v2
 * - Desativar categoria com validação de produtos
 * - Emoji picker funcional
 */

import { db } from '../core/supabase.js';
import { toast, buildModal, openModal, spinnerHTML } from '../core/ui.js';
import { ge } from '../core/helpers.js';
import State from '../core/state.js';

const EMOJIS = ['🍕','🍔','🌮','🍣','🍜','🍛','🥗','🍰','🍩','🥤','🍺','🥂','🍗','🥩','🌭','🥪','🥙','🫔','🍱','🥡','🍦','🧁','🎂','☕','🧃','🥛','🍫','🍬','🍭','🛵','🔥','⭐','💎','🆕','🎯'];

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
    <div class="prod-row" style="${!c.ativa ? 'opacity:.5' : ''}">
      <div style="width:46px;height:46px;background:var(--primary-dim);border-radius:10px;
        display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">
        ${c.icone || '🏷️'}
      </div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px;color:var(--text)">${c.nome}</div>
        <div style="font-size:12px;color:var(--muted)">Ordem: ${c.ordem} · ${c.ativa !== false ? '<span style="color:var(--green)">🟢 Ativa</span>' : '<span style="color:var(--accent)">🔴 Inativa</span>'}</div>
      </div>
      <div class="prod-actions">
        <label class="tog" title="${c.ativa !== false ? 'Desativar' : 'Ativar'}">
          <input type="checkbox" ${c.ativa !== false ? 'checked' : ''} onchange="Categorias.toggleAtiva(${c.id}, this.checked)"/>
          <span class="tog-sl"></span>
        </label>
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
        <div class="field"><label>Ordem</label><input id="ci-ordem" type="number" value="${c?.ordem ?? cats.length + 1}"/></div>
        <div class="field">
          <label>Emoji selecionado</label>
          <div style="display:flex;align-items:center;gap:10px">
            <div id="ci-emoji-preview" style="width:44px;height:44px;background:var(--primary-dim);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;border:1.5px solid var(--border)"
              onclick="document.getElementById('ci-emoji-picker').style.display=document.getElementById('ci-emoji-picker').style.display==='none'?'flex':'none'">
              ${c?.icone || '🏷️'}
            </div>
            <span style="font-size:12px;color:var(--muted)">Clique para trocar</span>
            <input type="hidden" id="ci-emoji-val" value="${c?.icone || '🏷️'}"/>
          </div>
        </div>
      </div>
      <!-- Emoji picker -->
      <div id="ci-emoji-picker" style="display:none;flex-wrap:wrap;gap:6px;background:var(--card);border-radius:var(--radius-sm);padding:12px;border:1px solid var(--border)">
        ${EMOJIS.map(e => `<button type="button" onclick="Categorias._pickEmoji('${e}')"
          style="width:36px;height:36px;background:transparent;border:1px solid var(--border);border-radius:8px;font-size:18px;cursor:pointer;transition:background .15s"
          onmouseover="this.style.background='var(--primary-dim)'" onmouseout="this.style.background='transparent'">${e}</button>`).join('')}
      </div>`,
    actions: `
      <button class="btn btn-primary" onclick="Categorias.save(${c?.id || 'null'})">💾 Salvar</button>
      <button class="btn btn-ghost" onclick="window.__closeModal()">Cancelar</button>`,
  }));
}

export function _pickEmoji(e) {
  const prev = ge('ci-emoji-preview'); if (prev) prev.textContent = e;
  const val  = ge('ci-emoji-val');    if (val)  val.value = e;
  const pick = ge('ci-emoji-picker'); if (pick) pick.style.display = 'none';
}

export async function toggleAtiva(id, ativa) {
  // Verificar se tem produtos atrelados ao desativar
  if (!ativa) {
    const { data: prods } = await db.from('produtos').select('id').eq('categoria_id', id).eq('ativo', true);
    if (prods && prods.length > 0) {
      toast(`⚠️ Esta categoria tem ${prods.length} produto(s) ativo(s). Desative-os primeiro!`, 'warn');
      // Reverte o toggle visualmente
      await load();
      return;
    }
  }
  await db.from('categorias').update({ ativa }).eq('id', id);
  toast(ativa ? 'Categoria ativada ✅' : 'Categoria desativada', 'info');
  await load();
}

export async function save(id) {
  const payload = {
    nome:  ge('ci-nome').value.trim(),
    icone: ge('ci-emoji-val')?.value || '🏷️',
    ordem: parseInt(ge('ci-ordem').value) || 1,
    ativa: true,
  };
  if (!payload.nome) { toast('Digite o nome', 'warn'); return; }
  const q = id ? db.from('categorias').update(payload).eq('id', id) : db.from('categorias').insert(payload);
  const { error } = await q;
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast(id ? 'Atualizada! ✅' : 'Criada! ✅', 'success');
  window.__closeModal();
  await load();
}

export async function del(id) {
  const { data: prods } = await db.from('produtos').select('id').eq('categoria_id', id);
  if (prods && prods.length > 0) {
    toast(`⚠️ Tem ${prods.length} produto(s) nesta categoria. Remova-os antes de excluir.`, 'warn');
    return;
  }
  if (!confirm('Excluir esta categoria?')) return;
  await db.from('categorias').delete().eq('id', id);
  toast('Excluída ✅', 'success');
  await load();
}

window.Categorias = { load, openForm, save, del, toggleAtiva, _pickEmoji };
