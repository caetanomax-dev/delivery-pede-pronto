/**
 * pedidos.js — Módulo de Pedidos (Kanban + Histórico)
 * Exporta: init, onNewOrder, onOrderUpdate (chamados pelo admin shell)
 */

import { db } from '../core/supabase.js';
import { toast, buildModal, openModal, closeModal, spinnerHTML } from '../core/ui.js';
import { fmt, ge, fmtDate, onlyDigits } from '../core/helpers.js';
import { KANBAN_COLS, STATUS_COLORS, HIST_PER_PAGE } from '../core/config.js';
import State from '../core/state.js';

// ─── STATE LOCAL ──────────────────────────────────────────────────────────────

let _orders = { recebido: [], aceito: [], preparando: [], entrega: [] };
let _finalizados = [];
let _histPage = 0;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export async function init() {
  await refresh();
}

export function onNewOrder(order) {
  if (!_orders.recebido) _orders.recebido = [];
  _orders.recebido.unshift(order);
  _renderKanban();
  _renderStats();
  State.update('newCount', n => n + 1);
}

export function onOrderUpdate(order) {
  // Remove do lugar antigo
  Object.keys(_orders).forEach(k => { _orders[k] = _orders[k].filter(o => o.id !== order.id); });
  _finalizados = _finalizados.filter(o => o.id !== order.id);
  // Insere no novo lugar
  if (order.status === 'finalizado') _finalizados.unshift(order);
  else if (_orders[order.status]) _orders[order.status].unshift(order);
  else _orders[order.status] = [order];
  _renderKanban();
  _renderHistorico();
  _renderStats();
}

export async function refresh() {
  ge('kanban-wrap').innerHTML = spinnerHTML;
  const { data, error } = await db.from('pedidos').select('*').order('created_at', { ascending: false });
  if (error) { toast('Erro ao carregar pedidos', 'error'); return; }

  _orders = { recebido: [], aceito: [], preparando: [], entrega: [] };
  _finalizados = [];
  (data || []).forEach(o => {
    if (o.status === 'finalizado') _finalizados.push(o);
    else if (_orders[o.status]) _orders[o.status].push(o);
  });

  _renderKanban();
  _renderStats();
  _renderHistorico();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function _renderStats() {
  const today = new Date().toDateString();
  const all = [...Object.values(_orders).flat(), ..._finalizados];
  const todayAll = all.filter(o => new Date(o.created_at).toDateString() === today);
  const todayFin = todayAll.filter(o => o.status === 'finalizado');
  const rev = todayFin.reduce((s, o) => s + Number(o.total), 0);
  const andamento = Object.values(_orders).flat().length;

  ge('order-stats').innerHTML = `
    <div class="stat-card"><div class="stat-val" style="color:var(--primary)">${todayAll.length}</div><div class="stat-label">Pedidos hoje</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--green)">${fmt(rev)}</div><div class="stat-label">Faturamento hoje</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--yellow)">${andamento}</div><div class="stat-label">Em andamento</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--blue)">${todayFin.length}</div><div class="stat-label">Finalizados hoje</div></div>`;
}

function _renderKanban() {
  ge('kanban-wrap').innerHTML = KANBAN_COLS.map(col => {
    const orders = _orders[col.key] || [];
    return `<div class="k-col">
      <div class="k-col-head" style="background:${col.color}18">
        <span class="k-col-label" style="color:${col.color}">${col.label}</span>
        <span class="k-col-count" style="background:${col.color};color:#111">${orders.length}</span>
      </div>
      ${!orders.length ? `<div class="k-empty">Nenhum pedido aqui</div>` : ''}
      ${orders.map(o => _renderKCard(o, col)).join('')}
    </div>`;
  }).join('');
}

function _renderKCard(o, col) {
  const items = JSON.parse(o.itens || '[]');
  const hora = fmtDate(o.created_at);
  return `<div class="k-card" onclick="Pedidos.openDetail(${o.id})">
    <div class="k-card-id" style="color:${col.color}">#${o.id} <span style="font-size:10px;color:var(--muted);font-weight:500">${hora}</span></div>
    <div class="k-card-name">${o.cliente_nome}</div>
    <div class="k-card-addr">📍 ${o.cliente_endereco}</div>
    <div style="font-size:11.5px;color:var(--muted);margin-bottom:9px">${items.length} iten${items.length !== 1 ? 's' : 'm'} · ${o.pagamento}</div>
    <div class="k-card-foot">
      <span class="k-card-total">${fmt(o.total)}</span>
      <button class="k-advance" style="background:${col.color};color:#111" onclick="event.stopPropagation();Pedidos.advance(${o.id},'${col.next}')">${col.nextLabel} →</button>
    </div>
  </div>`;
}

function _renderHistorico() {
  const hist = ge('historico-section');
  const body = ge('hist-body');
  const pag  = ge('hist-pag');
  if (!_finalizados.length) { hist.style.display = 'none'; return; }
  hist.style.display = 'block';
  const total = _finalizados.length;
  const pages = Math.ceil(total / HIST_PER_PAGE);
  const start = _histPage * HIST_PER_PAGE;
  const slice = _finalizados.slice(start, start + HIST_PER_PAGE);

  body.innerHTML = slice.map(o => {
    const hora = fmtDate(o.created_at);
    const tel = onlyDigits(o.cliente_telefone || '');
    return `<tr>
      <td><strong style="color:var(--primary)">#${o.id}</strong></td>
      <td>${hora}</td>
      <td>${o.cliente_nome}<br><span style="font-size:11px;color:var(--muted)">${o.cliente_telefone || ''}</span></td>
      <td><span class="badge" style="background:rgba(74,222,128,.12);color:var(--green)">${o.pagamento}</span></td>
      <td><strong>${fmt(o.total)}</strong></td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="Pedidos.openDetail(${o.id})">👁️</button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="Pedidos.print(${o.id})">🖨️</button>
        ${tel ? `<button class="btn btn-success btn-sm btn-icon" onclick="Pedidos.wpp(${o.id})">💬</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  // Pagination
  let pagHtml = '';
  if (pages > 1) {
    pagHtml += `<span class="hist-pag-info">${start + 1}–${Math.min(start + HIST_PER_PAGE, total)} de ${total}</span>`;
    if (_histPage > 0) pagHtml += `<button class="hist-pag-btn" onclick="Pedidos._histPage(${_histPage - 1})">‹</button>`;
    for (let i = 0; i < pages; i++) {
      if (Math.abs(i - _histPage) <= 2 || i === 0 || i === pages - 1)
        pagHtml += `<button class="hist-pag-btn${i === _histPage ? ' active' : ''}" onclick="Pedidos._histPage(${i})">${i + 1}</button>`;
      else if (Math.abs(i - _histPage) === 3)
        pagHtml += `<span style="color:var(--muted);padding:0 4px">…</span>`;
    }
    if (_histPage < pages - 1) pagHtml += `<button class="hist-pag-btn" onclick="Pedidos._histPage(${_histPage + 1})">›</button>`;
  }
  pag.innerHTML = pagHtml;
}

// ─── ACTIONS ──────────────────────────────────────────────────────────────────

export async function advance(id, status) {
  const { error } = await db.from('pedidos').update({ status }).eq('id', id);
  if (error) { toast('Erro ao atualizar', 'error'); return; }
  toast('Status atualizado!', 'success');

  if (status === 'finalizado') {
    const { data: o } = await db.from('pedidos').select('*').eq('id', id).single();
    if (o?.cliente_telefone) {
      const tel = onlyDigits(o.cliente_telefone);
      const cfg = State.config();
      const msg = `🎉 Olá ${o.cliente_nome}! Seu pedido *#${o.id}* foi *entregue com sucesso*!\nObrigado pela preferência! 😊\n\n${cfg.nome_fantasia || ''}`;
      if (confirm(`Enviar mensagem de entrega para ${o.cliente_telefone}?`))
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
    }
  }
  await refresh();
}

export async function openDetail(id) {
  const { data: o } = await db.from('pedidos').select('*').eq('id', id).single();
  if (!o) return;
  const col = KANBAN_COLS.find(c => c.key === o.status);
  const items = JSON.parse(o.itens || '[]');
  const hora = new Date(o.created_at).toLocaleString('pt-BR');
  const tel = onlyDigits(o.cliente_telefone || '');
  const sc = STATUS_COLORS[o.status] || '#6B7280';

  openModal(buildModal({
    title: `Pedido #${o.id} <span class="badge" style="background:${sc}22;color:${sc};font-size:12px;margin-left:8px">${o.status}</span>`,
    body: `
      <div class="card-sm" style="display:grid;gap:7px;font-size:13.5px">
        <div>👤 <strong>${o.cliente_nome}</strong></div>
        <div>📍 ${o.cliente_endereco}</div>
        <div>📱 ${o.cliente_telefone || 'Não informado'} ${tel ? `<a href="https://wa.me/${tel}" target="_blank" style="margin-left:8px;background:rgba(74,222,128,.15);color:var(--green);border-radius:6px;padding:2px 9px;font-size:11px;font-weight:700;text-decoration:none">💬 WPP</a>` : ''}</div>
        <div>💳 ${o.pagamento}${o.troco ? ` (Troco: ${fmt(o.troco)})` : ''}</div>
        <div style="color:var(--muted);font-size:11.5px">📅 ${hora}</div>
      </div>
      ${o.observacoes ? `<div style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);border-radius:10px;padding:12px;font-size:13px">📝 <strong>Obs:</strong> ${o.observacoes}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:5px">
        ${items.map(i => `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:7px 0;border-bottom:1px solid var(--border2);color:var(--text2)"><span>${i.qty}× ${i.nome}</span><span style="font-weight:600">${fmt(i.preco * i.qty)}</span></div>`).join('')}
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);padding:4px 0"><span>Subtotal</span><span>${fmt(o.subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);padding:4px 0"><span>Entrega</span><span>${fmt(o.taxa_entrega)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:17px;padding-top:10px;border-top:1px solid var(--border)"><span>TOTAL</span><span style="color:var(--primary)">${fmt(o.total)}</span></div>
      </div>`,
    actions: `
      ${col?.next ? `<button class="btn btn-primary" onclick="Pedidos.advance(${o.id},'${col.next}');window.__closeModal()">${col.nextLabel} →</button>` : ''}
      ${o.status === 'finalizado' && tel ? `<button class="btn btn-success" onclick="Pedidos.wpp(${o.id})">💬 Avisar</button>` : ''}
      <button class="btn btn-ghost" onclick="Pedidos.print(${o.id})">🖨️</button>
      <button class="btn btn-ghost btn-icon" onclick="window.__closeModal()">✕</button>`,
  }));
}

export async function wpp(id) {
  const { data: o } = await db.from('pedidos').select('*').eq('id', id).single();
  if (!o?.cliente_telefone) return;
  const tel = onlyDigits(o.cliente_telefone);
  const cfg = State.config();
  const msg = `🎉 Olá ${o.cliente_nome}! Seu pedido *#${o.id}* foi *entregue*!\nObrigado pela preferência! 😊\n${cfg.nome_fantasia || ''}`;
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}

export function print(id) {
  db.from('pedidos').select('*').eq('id', id).single().then(({ data: o }) => {
    if (!o) return;
    const items = JSON.parse(o.itens || '[]');
    const cfg = State.config();
    ge('print-area').style.display = 'block';
    ge('print-area').innerHTML = `<div style="font-family:monospace;font-size:12px;width:80mm;color:#000">
      <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:8px">
        <strong style="font-size:15px">${cfg.nome_fantasia || 'LOJA'}</strong><br/>
        PEDIDO #${o.id}<br/><span style="font-size:10px">${new Date(o.created_at).toLocaleString('pt-BR')}</span>
      </div>
      <div style="border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;font-size:11px;line-height:1.8">
        <strong>Cliente:</strong> ${o.cliente_nome}<br/>
        <strong>Endereço:</strong> ${o.cliente_endereco}<br/>
        <strong>Telefone:</strong> ${o.cliente_telefone || '-'}<br/>
        <strong>Pagamento:</strong> ${o.pagamento}${o.troco ? ' | Troco: ' + fmt(o.troco) : ''}
      </div>
      <div style="border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px">
        ${items.map(i => `<div style="display:flex;justify-content:space-between"><span>${i.qty}x ${i.nome}</span><span>${fmt(i.preco * i.qty)}</span></div>`).join('')}
      </div>
      <div style="font-size:11px;line-height:1.8">
        <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>${fmt(o.subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Entrega:</span><span>${fmt(o.taxa_entrega)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px"><span>TOTAL:</span><span>${fmt(o.total)}</span></div>
      </div>
      ${o.observacoes ? `<div style="border-top:1px dashed #000;margin-top:8px;padding-top:8px;font-size:11px"><strong>Obs:</strong> ${o.observacoes}</div>` : ''}
      <div style="text-align:center;margin-top:10px;border-top:2px dashed #000;padding-top:8px;font-size:10px">Obrigado pela preferência!</div>
    </div>`;
    window.print();
    setTimeout(() => { ge('print-area').style.display = 'none'; ge('print-area').innerHTML = ''; }, 1000);
  });
}

export function _histPage(p) { _histPage = p; _renderHistorico(); }

// Expõe para onclick inline do HTML do módulo
window.Pedidos = { refresh, advance, openDetail, wpp, print, _histPage };
