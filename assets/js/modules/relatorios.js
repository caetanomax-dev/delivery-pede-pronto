/**
 * relatorios.js — Módulo de Relatórios
 */

import { db } from '../core/supabase.js';
import { toast } from '../core/ui.js';
import { fmt, ge, toDateStr, exportCSV } from '../core/helpers.js';
import State from '../core/state.js';

export function init() {
  const hoje = new Date();
  ge('rel-inicio').value = toDateStr(hoje);
  ge('rel-fim').value    = toDateStr(hoje);
  load('hoje');
}

export async function load(periodo) {
  const hoje = new Date();
  let ini, fim = new Date(hoje);
  if (periodo === 'hoje')   ini = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  else if (periodo === 'semana') { ini = new Date(hoje); ini.setDate(hoje.getDate() - 6); }
  else if (periodo === 'mes')   ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  await _render(ini, fim, periodo);
}

export async function loadCustom() {
  if (!ge('rel-inicio').value || !ge('rel-fim').value) { toast('Selecione as datas', 'warn'); return; }
  const ini = new Date(ge('rel-inicio').value);
  const fim = new Date(ge('rel-fim').value + 'T23:59:59');
  await _render(ini, fim, 'custom');
}

async function _render(ini, fim, periodo) {
  const res = ge('relatorio-resultado');
  res.style.display = 'block';
  res.innerHTML = `<div class="loading-wrap"><div class="spinner"></div></div>`;

  const { data } = await db.from('pedidos').select('*')
    .gte('created_at', ini.toISOString())
    .lte('created_at', fim.toISOString())
    .eq('status', 'finalizado')
    .order('created_at');

  const todos   = data || [];
  const rev     = todos.reduce((s, o) => s + Number(o.total), 0);
  const entrega = todos.reduce((s, o) => s + Number(o.taxa_entrega || 0), 0);
  const pgtos   = {};
  todos.forEach(o => { const p = o.pagamento || 'Outro'; pgtos[p] = (pgtos[p] || 0) + Number(o.total); });

  const titulos = { hoje: 'Hoje', semana: 'Últimos 7 dias', mes: 'Este mês', custom: 'Período personalizado' };
  const titulo  = titulos[periodo] || 'Relatório';
  const dataStr = `${ini.toLocaleDateString('pt-BR')} a ${fim.toLocaleDateString('pt-BR')}`;

  res.innerHTML = `
  <div class="stats-grid" style="margin-bottom:18px">
    <div class="stat-card"><div class="stat-val" style="color:var(--primary)">${todos.length}</div><div class="stat-label">Pedidos finalizados</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--green)">${fmt(rev)}</div><div class="stat-label">Faturamento total</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--blue)">${fmt(entrega)}</div><div class="stat-label">Taxas de entrega</div></div>
    <div class="stat-card"><div class="stat-val" style="color:var(--yellow)">${todos.length ? fmt(rev / todos.length) : 'R$ 0,00'}</div><div class="stat-label">Ticket médio</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">
    <div class="card">
      <div style="font-size:13px;font-weight:700;color:var(--text2);margin-bottom:14px;text-transform:uppercase;letter-spacing:.05em">💳 Por Forma de Pagamento</div>
      ${Object.entries(pgtos).map(([p, v]) => `
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border2);font-size:13.5px;color:var(--text2)">
          <span>${p}</span><span style="font-weight:700;color:var(--text)">${fmt(v)}</span>
        </div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding-top:12px;font-weight:800;font-size:15px"><span>Total</span><span style="color:var(--primary)">${fmt(rev)}</span></div>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:10px">
      <div style="font-size:13px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">⚡ Ações</div>
      <button class="btn btn-primary" onclick="Relatorios._print('${titulo}','${dataStr}',${todos.length},${rev},${entrega})">🖨️ Imprimir</button>
      <button class="btn btn-ghost" onclick="Relatorios._csv()">📥 Exportar CSV</button>
    </div>
  </div>
  ${todos.length > 0 ? `
  <div class="card" style="padding:0;overflow:hidden">
    <table class="hist-table">
      <thead><tr><th>#</th><th>Data/Hora</th><th>Cliente</th><th>Telefone</th><th>Pagamento</th><th>Total</th></tr></thead>
      <tbody>
        ${todos.map(o => `<tr>
          <td><strong style="color:var(--primary)">#${o.id}</strong></td>
          <td style="font-size:12px">${new Date(o.created_at).toLocaleString('pt-BR')}</td>
          <td>${o.cliente_nome}</td>
          <td style="font-size:12px">${o.cliente_telefone || '-'}</td>
          <td><span class="badge" style="background:rgba(74,222,128,.12);color:var(--green)">${o.pagamento}</span></td>
          <td><strong>${fmt(o.total)}</strong></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : `<div class="loading-wrap"><p>Nenhum pedido finalizado neste período</p></div>`}`;

  // Store for export
  window._relatorioData = todos;
}

export function _print(titulo, periodo, qtd, rev, entrega) {
  const cfg = State.config();
  const pgtos = window._relatorioData
    ? window._relatorioData.reduce((acc, o) => { const p = o.pagamento || 'Outro'; acc[p] = (acc[p] || 0) + Number(o.total); return acc; }, {})
    : {};
  ge('print-area').style.display = 'block';
  ge('print-area').innerHTML = `<div style="font-family:monospace;font-size:12px;width:80mm;color:#000">
    <div style="text-align:center;border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:8px">
      <strong style="font-size:14px">${cfg.nome_fantasia || 'LOJA'}</strong><br/>
      RELATÓRIO — ${titulo.toUpperCase()}<br/>${periodo}
    </div>
    <div style="border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px;line-height:1.8;font-size:11px">
      <div style="display:flex;justify-content:space-between"><span>Total de pedidos:</span><span>${qtd}</span></div>
      ${Object.entries(pgtos).map(([p, v]) => `<div style="display:flex;justify-content:space-between"><span>${p}:</span><span>${fmt(v)}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between"><span>Taxa de entrega:</span><span>${fmt(entrega)}</span></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px">
      <span>FATURAMENTO TOTAL:</span><span>${fmt(rev)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:4px">
      <span>Ticket médio:</span><span>${qtd ? fmt(rev / qtd) : 'R$ 0,00'}</span>
    </div>
    <div style="text-align:center;margin-top:12px;border-top:2px dashed #000;padding-top:8px;font-size:10px">Relatório gerado automaticamente</div>
  </div>`;
  window.print();
  setTimeout(() => { ge('print-area').style.display = 'none'; ge('print-area').innerHTML = ''; }, 1000);
}

export function _csv() {
  const todos = window._relatorioData || [];
  const rows = [
    ['ID', 'Data', 'Cliente', 'Telefone', 'Endereço', 'Pagamento', 'Total'],
    ...todos.map(o => [o.id, new Date(o.created_at).toLocaleString('pt-BR'), o.cliente_nome, o.cliente_telefone || '', o.cliente_endereco, o.pagamento, o.total]),
  ];
  exportCSV(rows, 'relatorio.csv');
  toast('CSV exportado!', 'success');
}

window.Relatorios = { load, loadCustom, _print, _csv };
