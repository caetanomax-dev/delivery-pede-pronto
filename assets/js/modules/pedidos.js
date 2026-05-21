/**
 * pedidos.js — Módulo de Pedidos (Kanban + Histórico + Fechamento do Dia)
 * v2: realtime corrigido, WhatsApp ao finalizar, fechamento do dia com impressão
 */

import { db } from '../core/supabase.js';
import { toast, buildModal, openModal, spinnerHTML } from '../core/ui.js';
import { fmt, ge, fmtDate, onlyDigits, exportCSV } from '../core/helpers.js';
import { KANBAN_COLS, STATUS_COLORS, HIST_PER_PAGE } from '../core/config.js';
import State from '../core/state.js';

// ─── STATE LOCAL ──────────────────────────────────────────────────────────────

let _orders = { recebido: [], aceito: [], preparando: [], entrega: [] };
let _finalizados = [];
let _histPage = 0;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

let _autoRefreshTimer = null;

export async function init() {
  await refresh();
  _startAutoRefresh();
}

function _startAutoRefresh() {
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  // Auto-atualiza a cada 30 segundos como fallback do realtime
  _autoRefreshTimer = setInterval(() => {
    refresh();
  }, 30000);
}

/** Chamado pelo admin shell ao receber novo pedido via realtime */
export function onNewOrder(order) {
  if (!_orders.recebido) _orders.recebido = [];
  // Evita duplicata
  if (_orders.recebido.find(o => o.id === order.id)) return;
  _orders.recebido.unshift(order);
  _renderKanban();
  _renderStats();
}

/** Chamado pelo admin shell ao atualizar pedido via realtime */
export function onOrderUpdate(order) {
  // Remove de todos os lugares
  Object.keys(_orders).forEach(k => { _orders[k] = (_orders[k] || []).filter(o => o.id !== order.id); });
  _finalizados = _finalizados.filter(o => o.id !== order.id);
  // Insere no lugar correto
  if (order.status === 'finalizado') _finalizados.unshift(order);
  else if (_orders[order.status] !== undefined) _orders[order.status].unshift(order);
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
    else if (_orders[o.status] !== undefined) _orders[o.status].push(o);
  });

  _renderKanban();
  _renderStats();
  _renderHistorico();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function _renderStats() {
  const today  = new Date().toDateString();
  const all    = [...Object.values(_orders).flat(), ..._finalizados];
  const todayAll = all.filter(o => new Date(o.created_at).toDateString() === today);
  const todayFin = todayAll.filter(o => o.status === 'finalizado');
  const rev      = todayFin.reduce((s, o) => s + Number(o.total), 0);
  const andamento = Object.values(_orders).flat().length;

  const el = ge('order-stats');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-val" style="color:var(--primary)">${todayAll.length}</div><div class="stat-label">Pedidos hoje</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--green)">${fmt(rev)}</div><div class="stat-label">Faturamento hoje</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--yellow)">${andamento}</div><div class="stat-label">Em andamento</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--blue)">${todayFin.length}</div><div class="stat-label">Finalizados hoje</div></div>`;
}

function _renderKanban() {
  const wrap = ge('kanban-wrap');
  if (!wrap) return;
  wrap.innerHTML = KANBAN_COLS.map(col => {
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
  const hora  = fmtDate(o.created_at);
  return `<div class="k-card" onclick="Pedidos.openDetail(${o.id})">
    <div class="k-card-id" style="color:${col.color}">#${o.id} <span style="font-size:10px;color:var(--muted);font-weight:500">${hora}</span></div>
    <div class="k-card-name">${o.cliente_nome}</div>
    <div class="k-card-addr">📍 ${o.cliente_endereco}</div>
    <div style="font-size:11.5px;color:var(--muted);margin-bottom:9px">${items.length} iten${items.length!==1?'s':'m'} · ${o.pagamento}</div>
    <div class="k-card-foot">
      <span class="k-card-total">${fmt(o.total)}</span>
      <button class="k-advance" style="background:${col.color};color:#111"
        onclick="event.stopPropagation();Pedidos.advance(${o.id},'${col.next}')">${col.nextLabel} →</button>
    </div>
  </div>`;
}

function _renderHistorico() {
  const hist = ge('historico-section');
  const body = ge('hist-body');
  const pag  = ge('hist-pag');
  if (!hist || !body) return;
  // Mostra apenas finalizados do dia atual
  const hoje = new Date().toDateString();
  const todayFin = _finalizados.filter(o => new Date(o.created_at).toDateString() === hoje);
  if (!todayFin.length) { hist.style.display = 'none'; return; }
  hist.style.display = 'block';

  const total  = todayFin.length;
  const pages  = Math.ceil(total / HIST_PER_PAGE);
  const start  = _histPage * HIST_PER_PAGE;
  const slice  = todayFin.slice(start, start + HIST_PER_PAGE);

  body.innerHTML = slice.map(o => {
    const tel = onlyDigits(o.cliente_telefone || '');
    return `<tr>
      <td><strong style="color:var(--primary)">#${o.id}</strong></td>
      <td>${fmtDate(o.created_at)}</td>
      <td>${o.cliente_nome}<br><span style="font-size:11px;color:var(--muted)">${o.cliente_telefone||''}</span></td>
      <td><span class="badge" style="background:rgba(74,222,128,.12);color:var(--green)">${o.pagamento}</span></td>
      <td><strong>${fmt(o.total)}</strong></td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm btn-icon" title="Ver detalhe" onclick="Pedidos.openDetail(${o.id})">👁️</button>
        <button class="btn btn-ghost btn-sm btn-icon" title="Imprimir" onclick="Pedidos.print(${o.id})">🖨️</button>
        ${tel ? `<button class="btn btn-success btn-sm btn-icon" title="WhatsApp" onclick="Pedidos.wpp(${o.id})">💬</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  let pagHtml = '';
  if (pages > 1) {
    pagHtml += `<span class="hist-pag-info">${start+1}–${Math.min(start+HIST_PER_PAGE,total)} de ${total}</span>`;
    if (_histPage > 0) pagHtml += `<button class="hist-pag-btn" onclick="Pedidos.goHistPage(${_histPage-1})">‹</button>`;
    for (let i = 0; i < pages; i++) {
      if (Math.abs(i-_histPage) <= 2 || i === 0 || i === pages-1)
        pagHtml += `<button class="hist-pag-btn${i===_histPage?' active':''}" onclick="Pedidos.goHistPage(${i})">${i+1}</button>`;
      else if (Math.abs(i-_histPage) === 3)
        pagHtml += `<span style="color:var(--muted);padding:0 4px">…</span>`;
    }
    if (_histPage < pages-1) pagHtml += `<button class="hist-pag-btn" onclick="Pedidos.goHistPage(${_histPage+1})">›</button>`;
  }
  if (pag) pag.innerHTML = pagHtml;
}

// ─── ACTIONS ──────────────────────────────────────────────────────────────────

export async function advance(id, status) {
  const { error } = await db.from('pedidos').update({ status }).eq('id', id);
  if (error) { toast('Erro ao atualizar', 'error'); return; }
  toast('Status atualizado!', 'success');

  // WhatsApp automático ao finalizar
  if (status === 'finalizado') {
    const { data: o } = await db.from('pedidos').select('*').eq('id', id).single();
    if (o?.cliente_telefone) {
      const tel = onlyDigits(o.cliente_telefone);
      const cfg = State.config();
      const msg = `🎉 Olá ${o.cliente_nome}! Seu pedido *#${o.id}* foi *entregue com sucesso*!\nObrigado pela preferência! 😊\n${cfg.nome_fantasia || ''}`;
      if (confirm(`Enviar mensagem de entrega para ${o.cliente_telefone}?`))
        window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
    }
  }
  await refresh();
}

export async function openDetail(id) {
  const all = [...Object.values(_orders).flat(), ..._finalizados];
  let o = all.find(x => x.id === id);
  if (!o) {
    const { data } = await db.from('pedidos').select('*').eq('id', id).single();
    o = data;
  }
  if (!o) return;

  const col   = KANBAN_COLS.find(c => c.key === o.status);
  const items = JSON.parse(o.itens || '[]');
  const hora  = new Date(o.created_at).toLocaleString('pt-BR');
  const tel   = onlyDigits(o.cliente_telefone || '');
  const sc    = STATUS_COLORS[o.status] || '#6B7280';

  openModal(buildModal({
    title: `Pedido #${o.id} <span class="badge" style="background:${sc}22;color:${sc};font-size:12px;margin-left:8px">${o.status}</span>`,
    body: `
      <div class="card-sm" style="display:grid;gap:7px;font-size:13.5px">
        <div>👤 <strong>${o.cliente_nome}</strong></div>
        <div>📍 ${o.cliente_endereco}</div>
        <div>📱 ${o.cliente_telefone||'Não informado'}
          ${tel ? `<a href="https://wa.me/${tel}" target="_blank"
            style="margin-left:8px;background:rgba(74,222,128,.15);color:var(--green);border-radius:6px;padding:2px 9px;font-size:11px;font-weight:700;text-decoration:none">💬 WPP</a>` : ''}
        </div>
        <div>💳 ${o.pagamento}${o.troco ? ` (Troco: ${fmt(o.troco)})` : ''}</div>
        <div style="color:var(--muted);font-size:11.5px">📅 ${hora}</div>
      </div>
      ${o.observacoes ? `<div style="background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);border-radius:10px;padding:12px;font-size:13px">📝 <strong>Obs:</strong> ${o.observacoes}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:2px">
        ${items.map(i => `<div style="display:flex;justify-content:space-between;font-size:13.5px;padding:7px 0;border-bottom:1px solid var(--border2);color:var(--text2)">
          <span>${i.qty}× ${i.nome}</span><span style="font-weight:600">${fmt(i.preco*i.qty)}</span></div>`).join('')}
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);padding:4px 0"><span>Subtotal</span><span>${fmt(o.subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);padding:4px 0"><span>Entrega</span><span>${fmt(o.taxa_entrega)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:17px;padding-top:10px;border-top:1px solid var(--border)"><span>TOTAL</span><span style="color:var(--primary)">${fmt(o.total)}</span></div>
      </div>`,
    actions: `
      ${col?.next ? `<button class="btn btn-primary" onclick="Pedidos.advance(${o.id},'${col.next}');window.__closeModal()">${col.nextLabel} →</button>` : ''}
      ${tel ? `<button class="btn btn-success" onclick="Pedidos.wpp(${o.id})">💬 WhatsApp</button>` : ''}
      <button class="btn btn-ghost" onclick="Pedidos.print(${o.id})">🖨️</button>
      <button class="btn btn-ghost btn-icon" onclick="window.__closeModal()">✕</button>`,
  }));
}

export async function wpp(id) {
  const all = [...Object.values(_orders).flat(), ..._finalizados];
  let o = all.find(x => x.id === id);
  if (!o) { const { data } = await db.from('pedidos').select('*').eq('id', id).single(); o = data; }
  if (!o?.cliente_telefone) return;
  const tel = onlyDigits(o.cliente_telefone);
  const cfg = State.config();
  const msg = `🎉 Olá ${o.cliente_nome}! Seu pedido *#${o.id}* foi *entregue*!\nObrigado pela preferência! 😊\n${cfg.nome_fantasia||''}`;
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}

export async function print(id) {
  const all = [...Object.values(_orders).flat(), ..._finalizados];
  let o = all.find(x => x.id === id);
  if (!o) { const { data } = await db.from('pedidos').select('*').eq('id', id).single(); o = data; }
  if (!o) return;
  const items = JSON.parse(o.itens || '[]');
  const cfg   = State.config();
  _doPrint(`<div style="font-family:monospace;font-size:12px;width:80mm;color:#000">
    <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:8px">
      <strong style="font-size:15px">${cfg.nome_fantasia||'LOJA'}</strong><br/>
      PEDIDO #${o.id}<br/><span style="font-size:10px">${new Date(o.created_at).toLocaleString('pt-BR')}</span>
    </div>
    <div style="border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;font-size:11px;line-height:1.8">
      <strong>Cliente:</strong> ${o.cliente_nome}<br/>
      <strong>Endereço:</strong> ${o.cliente_endereco}<br/>
      <strong>Telefone:</strong> ${o.cliente_telefone||'-'}<br/>
      <strong>Pagamento:</strong> ${o.pagamento}${o.troco?` | Troco: ${fmt(o.troco)}`:''}
    </div>
    <div style="border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px">
      ${items.map(i=>`<div style="display:flex;justify-content:space-between"><span>${i.qty}x ${i.nome}</span><span>${fmt(i.preco*i.qty)}</span></div>`).join('')}
    </div>
    <div style="font-size:11px;line-height:1.8">
      <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>${fmt(o.subtotal)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Entrega:</span><span>${fmt(o.taxa_entrega)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px"><span>TOTAL:</span><span>${fmt(o.total)}</span></div>
    </div>
    ${o.observacoes?`<div style="border-top:1px dashed #000;margin-top:8px;padding-top:8px;font-size:11px"><strong>Obs:</strong> ${o.observacoes}</div>`:''}
    <div style="text-align:center;margin-top:10px;border-top:2px dashed #000;padding-top:8px;font-size:10px">Obrigado pela preferência!</div>
  </div>`);
}

// ─── FECHAMENTO DO DIA ────────────────────────────────────────────────────────

export function openFechamento() {
  const hoje     = new Date().toDateString();
  const todayFin = _finalizados.filter(o => new Date(o.created_at).toDateString() === hoje);
  const todayAll = [...Object.values(_orders).flat(), ..._finalizados].filter(o => new Date(o.created_at).toDateString() === hoje);
  const rev      = todayFin.reduce((s, o) => s + Number(o.total), 0);
  const entrega  = todayFin.reduce((s, o) => s + Number(o.taxa_entrega||0), 0);
  const pgtos    = {};
  todayFin.forEach(o => { const p = o.pagamento||'Outro'; pgtos[p] = (pgtos[p]||0) + Number(o.total); });
  const cfg      = State.config();
  const dataStr  = new Date().toLocaleDateString('pt-BR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  openModal(buildModal({
    title: '📊 Fechamento do Dia',
    body: `
      <div style="font-size:13px;color:var(--muted);margin-bottom:16px">${dataStr}</div>
      <div class="stats-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">
        <div class="stat-card"><div class="stat-val" style="color:var(--primary)">${todayAll.length}</div><div class="stat-label">Total de pedidos</div></div>
        <div class="stat-card"><div class="stat-val" style="color:var(--green)">${fmt(rev)}</div><div class="stat-label">Faturamento</div></div>
        <div class="stat-card"><div class="stat-val" style="color:var(--blue)">${fmt(entrega)}</div><div class="stat-label">Taxas de entrega</div></div>
        <div class="stat-card"><div class="stat-val" style="color:var(--yellow)">${todayFin.length ? fmt(rev/todayFin.length) : 'R$ 0,00'}</div><div class="stat-label">Ticket médio</div></div>
      </div>
      <div class="card-sm" style="margin-bottom:12px">
        <div style="font-weight:700;font-size:12px;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em">💳 Por Pagamento</div>
        ${Object.entries(pgtos).map(([p,v]) => `
          <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border2);font-size:13px;color:var(--text2)">
            <span>${p}</span><span style="font-weight:700">${fmt(v)}</span>
          </div>`).join('')}
        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;padding-top:10px"><span>Total</span><span style="color:var(--primary)">${fmt(rev)}</span></div>
      </div>
      ${todayFin.length > 0 ? `
      <div style="max-height:220px;overflow-y:auto;border-radius:var(--radius-sm);border:1px solid var(--border2)">
        <table class="hist-table" style="width:100%">
          <thead><tr><th>#</th><th>Hora</th><th>Cliente</th><th>Pgto</th><th>Total</th></tr></thead>
          <tbody>
            ${todayFin.map(o=>`<tr>
              <td style="color:var(--primary);font-weight:700">#${o.id}</td>
              <td style="font-size:11px">${fmtDate(o.created_at)}</td>
              <td>${o.cliente_nome}</td>
              <td><span class="badge" style="background:rgba(74,222,128,.12);color:var(--green);font-size:10px">${o.pagamento}</span></td>
              <td><strong>${fmt(o.total)}</strong></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : `<div style="text-align:center;color:var(--muted);padding:20px">Nenhum pedido finalizado hoje</div>`}`,
    actions: `
      <button class="btn btn-primary" onclick="Pedidos.printFechamento()">🖨️ Imprimir</button>
      <button class="btn btn-ghost" onclick="Pedidos.csvFechamento()">📥 CSV</button>
      <button class="btn btn-ghost" onclick="window.__closeModal()">Fechar</button>`,
  }));

  // Armazena dados para impressão/export
  window._fechamentoData = { todayFin, todayAll, rev, entrega, pgtos, cfg, dataStr };
}

export function printFechamento() {
  const { todayFin, todayAll, rev, entrega, pgtos, cfg, dataStr } = window._fechamentoData || {};
  if (!todayFin) return;
  _doPrint(`<div style="font-family:monospace;font-size:11px;width:80mm;color:#000">
    <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:8px">
      <strong style="font-size:14px">${cfg.nome_fantasia||'LOJA'}</strong><br/>
      FECHAMENTO DO DIA<br/>
      <span style="font-size:10px">${dataStr}</span>
    </div>
    <div style="border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;line-height:1.8">
      <div style="display:flex;justify-content:space-between"><span>Total de pedidos:</span><span>${todayAll.length}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Finalizados:</span><span>${todayFin.length}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Taxas de entrega:</span><span>${fmt(entrega)}</span></div>
    </div>
    <div style="border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;line-height:1.8">
      ${Object.entries(pgtos).map(([p,v])=>`<div style="display:flex;justify-content:space-between"><span>${p}:</span><span>${fmt(v)}</span></div>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-bottom:8px">
      <span>TOTAL GERAL:</span><span>${fmt(rev)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px">
      <span>Ticket médio:</span><span>${todayFin.length ? fmt(rev/todayFin.length) : 'R$ 0,00'}</span>
    </div>
    <div style="border-top:1px dashed #000;padding-top:8px;font-size:10px">
      ${todayFin.map(o=>`<div style="display:flex;justify-content:space-between">
        <span>#${o.id} ${o.cliente_nome.split(' ')[0]}</span>
        <span>${fmt(o.total)}</span>
      </div>`).join('')}
    </div>
    <div style="text-align:center;margin-top:10px;border-top:2px dashed #000;padding-top:8px;font-size:10px">
      Relatório gerado automaticamente
    </div>
  </div>`);
}

export function csvFechamento() {
  const { todayFin } = window._fechamentoData || {};
  if (!todayFin?.length) { toast('Nenhum pedido para exportar', 'warn'); return; }
  const rows = [
    ['ID','Hora','Cliente','Telefone','Endereço','Pagamento','Subtotal','Entrega','Total'],
    ...todayFin.map(o=>[o.id, new Date(o.created_at).toLocaleString('pt-BR'), o.cliente_nome, o.cliente_telefone||'', o.cliente_endereco, o.pagamento, o.subtotal, o.taxa_entrega, o.total]),
  ];
  exportCSV(rows, `fechamento_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.csv`);
  toast('CSV exportado!', 'success');
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function _doPrint(html) {
  const area = ge('print-area');
  if (!area) return;
  area.style.display = 'block';
  area.innerHTML = html;
  window.print();
  setTimeout(() => { area.style.display = 'none'; area.innerHTML = ''; }, 1200);
}

export function goHistPage(p) { _histPage = p; _renderHistorico(); }

// Expõe para onclick inline
window.Pedidos = { refresh, advance, openDetail, wpp, print, goHistPage, openFechamento, printFechamento, csvFechamento };
