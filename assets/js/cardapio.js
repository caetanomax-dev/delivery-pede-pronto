/**
 * cardapio.js — Lógica do cardápio público
 * Melhorias v2: telefone primeiro + busca último pedido, CEP automático,
 * máscara de telefone obrigatória, Enter para avançar campos, validações.
 */

import { db } from './core/supabase.js';
import { toast, applyTheme, closeModal, openModal } from './core/ui.js';
import { fmt, ge, onlyDigits } from './core/helpers.js';
import { startTrackRealtime, stopRealtime } from './core/realtime.js';
import { TRACK_STEPS } from './core/config.js';

// ─── ESTADO LOCAL ─────────────────────────────────────────────────────────────

const S = {
  config: {},
  categories: [],
  products: [],
  cart: [],
  deliveryFee: 0,
  activeCat: 'all',
  storeEmoji: '🏪',
  ckStep: 1,
  lastOrder: null,
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const effPrice = (item) => (item.preco_oferta > 0 && item.preco_oferta < item.preco) ? item.preco_oferta : item.preco;
const hasOffer  = (p)   => p.preco_oferta && p.preco_oferta > 0 && p.preco_oferta < p.preco;

function maskTel(input) {
  let v = onlyDigits(input.value).slice(0, 11);
  if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
  else if (v.length > 0) v = `(${v}`;
  input.value = v;
}

function maskCEP(input) {
  let v = onlyDigits(input.value).slice(0, 8);
  if (v.length > 5) v = `${v.slice(0,5)}-${v.slice(5)}`;
  input.value = v;
}

async function fetchLastOrder(tel) {
  const digits = onlyDigits(tel);
  if (digits.length < 10) { S.lastOrder = null; return; }
  const { data } = await db.from('pedidos')
    .select('cliente_nome, cliente_endereco, cliente_telefone')
    .ilike('cliente_telefone', `%${digits.slice(-8)}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  S.lastOrder = data || null;
  if (data) toast(`👋 Olá de volta, ${data.cliente_nome.split(' ')[0]}!`, 'success');
}

async function fetchCEP(raw) {
  const c = onlyDigits(raw);
  if (c.length !== 8) return;
  const spinEl = ge('ck-cep-spin');
  if (spinEl) spinEl.style.display = 'inline';
  try {
    const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
    const d = await r.json();
    if (d.erro) throw new Error();
    const rua    = ge('ck-rua');
    const bairro = ge('ck-bairro');
    if (rua    && !rua.value)    rua.value    = d.logradouro || '';
    if (bairro && !bairro.value) bairro.value = d.bairro     || '';
    if (rua) rua.focus();
    toast('CEP preenchido ✅', 'success');
  } catch { toast('CEP não encontrado — preencha manualmente', 'warn'); }
  if (spinEl) spinEl.style.display = 'none';
}

// ─── TEMA ─────────────────────────────────────────────────────────────────────

function _applyStoreTheme(cfg) {
  applyTheme(cfg);

  const emoji = cfg.logo_emoji || '🏪';
  S.storeEmoji = emoji;

  // Header — só o ícone pequeno
  const hdrIcon = ge('hdr-icon');
  if (hdrIcon) {
    if (cfg.logo_url) {
      hdrIcon.innerHTML = `<img src="${cfg.logo_url}" alt="logo" onerror="this.parentNode.textContent='${emoji}'"/>`;
    } else {
      hdrIcon.textContent = emoji;
    }
  }

  // Hero — logo grande
  const heroLogo = ge('hero-logo-img');
  if (heroLogo) {
    if (cfg.logo_url) {
      heroLogo.innerHTML = `<img src="${cfg.logo_url}" alt="logo" onerror="this.parentNode.textContent='${emoji}'"/>`;
    } else {
      heroLogo.textContent = emoji;
    }
  }

  // Textos
  const heroName = ge('hero-name');
  if (heroName) heroName.textContent = cfg.nome_fantasia || 'Nossa Loja';
  if (cfg.descricao) { const d = ge('hero-desc'); if (d) d.textContent = cfg.descricao; }
  document.title = cfg.nome_fantasia || 'Cardápio';
}

// ─── CARRINHO ─────────────────────────────────────────────────────────────────

function updateCartBadge() {
  const total  = S.cart.reduce((s, i) => s + i.qty, 0);
  const countEl = ge('cart-count');
  const fabEl   = ge('fab-count');
  if (countEl) { countEl.textContent = total; countEl.style.display = total > 0 ? 'inline-block' : 'none'; }
  if (fabEl)   fabEl.textContent = `${total} iten${total !== 1 ? 's' : 'm'}`;
}

function addToCart(prodId) {
  const p = S.products.find(x => x.id === prodId);
  if (!p) return;
  const existing = S.cart.find(i => i.id === prodId);
  if (existing) existing.qty++;
  else S.cart.push({ ...p, qty: 1 });
  updateCartBadge();
  toast(`${p.nome} adicionado! 🛒`, 'success');
}

function removeFromCart(prodId) {
  const idx = S.cart.findIndex(i => i.id === prodId);
  if (idx === -1) return;
  if (S.cart[idx].qty > 1) S.cart[idx].qty--;
  else S.cart.splice(idx, 1);
  updateCartBadge();
}

// ─── CHECKOUT MODAL ───────────────────────────────────────────────────────────

function openCart() {
  if (!S.cart.length) { toast('Seu carrinho está vazio 🛒', 'warn'); return; }
  S.ckStep = 1;
  S.deliveryFee = 0;
  renderCheckoutModal();
}

function renderCheckoutModal() {
  openModal(_buildCheckoutHTML());
  setTimeout(_bindEnterKeys, 80);
}

function _buildCheckoutHTML() {
  const steps = ['Carrinho', 'Contato', 'Endereço', 'Pagamento', 'Confirmar'];
  const stepBar = steps.map((s, i) => `
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
      <div style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;
        background:${i+1 <= S.ckStep ? 'var(--primary)' : 'var(--card2)'};
        color:${i+1 <= S.ckStep ? '#fff' : 'var(--muted)'}">${i+1}</div>
      <span style="font-size:9px;color:${i+1===S.ckStep?'var(--primary)':'var(--muted)'};font-weight:600">${s}</span>
    </div>
    ${i < steps.length-1 ? `<div style="flex:1;height:2px;background:${i+1<S.ckStep?'var(--primary)':'var(--border)'};margin-top:13px"></div>` : ''}`
  ).join('');

  return `
  <div class="modal-overlay" onclick="if(event.target===this)window.__closeModal()">
    <div class="modal-box modal-box-large">
      <div class="modal-head">
        <div class="modal-title">🛒 Seu Pedido</div>
        <button class="modal-close" onclick="window.__closeModal()">✕</button>
      </div>
      <div style="display:flex;align-items:flex-start;gap:0;padding:4px 0">${stepBar}</div>
      <div id="ck-content">${_ckStepContent()}</div>
      <div class="modal-actions">
        ${S.ckStep > 1 ? `<button class="btn btn-ghost" onclick="Cardapio._ckPrev()">← Voltar</button>` : ''}
        ${S.ckStep < 5
          ? `<button class="btn btn-primary" id="ck-next" onclick="Cardapio._ckNext()">Continuar →</button>`
          : `<button class="btn btn-primary" id="ck-next" onclick="Cardapio._placeOrder()">✅ Confirmar Pedido</button>`}
      </div>
    </div>
  </div>`;
}

function _ckStepContent() {
  if (S.ckStep === 1) return _ckStep1();
  if (S.ckStep === 2) return _ckStep2();
  if (S.ckStep === 3) return _ckStep3();
  if (S.ckStep === 4) return _ckStep4();
  return _ckStep5();
}

function _ckStep1() {
  const sub = S.cart.reduce((s, i) => s + (effPrice(i) * i.qty), 0);
  return `
    <div class="ck-section-title">Itens do pedido</div>
    ${S.cart.map(i => `
      <div class="cart-item">
        <span class="cart-item-name">${i.nome}</span>
        <div class="cart-item-qty">
          <button class="cart-qty-btn" onclick="Cardapio._removeItem(${i.id})">−</button>
          <span style="font-weight:700;font-size:14px;min-width:20px;text-align:center">${i.qty}</span>
          <button class="cart-qty-btn" onclick="Cardapio._addItem(${i.id})">+</button>
        </div>
        <span class="cart-item-total">${fmt(effPrice(i) * i.qty)}</span>
      </div>`).join('')}
    <div style="display:flex;justify-content:space-between;font-weight:800;font-size:16px;padding-top:14px;border-top:1px solid var(--border)">
      <span>Subtotal</span><span style="color:var(--primary)">${fmt(sub)}</span>
    </div>`;
}

function _ckStep2() {
  const last = S.lastOrder;
  return `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="background:var(--primary-dim);border:1px solid rgba(108,99,255,.2);border-radius:var(--radius-sm);padding:11px;font-size:12px;color:var(--text2)">
        📱 Digite seu WhatsApp — se já pediu antes preenchemos tudo automaticamente!
      </div>
      <div class="field">
        <label>WhatsApp / Telefone * <span style="font-size:10px;color:var(--muted)">(com DDD)</span></label>
        <input id="ck-tel" type="tel" placeholder="(11) 99999-9999" maxlength="15"
          value="${last?.cliente_telefone || ''}"
          oninput="Cardapio._maskTel(this)"
          onblur="Cardapio._onTelBlur(this.value)"/>
      </div>
      <div class="field">
        <label>Nome completo *</label>
        <input id="ck-nome" placeholder="Seu nome completo" value="${last?.cliente_nome || ''}"/>
      </div>
      <div class="field">
        <label>Observações</label>
        <textarea id="ck-obs" rows="2" placeholder="Alguma preferência, alergia, ponto da carne..."></textarea>
      </div>
    </div>`;
}

function _ckStep3() {
  let ruaVal = '', numVal = '', bairroVal = '', compVal = '';
  if (S.lastOrder?.cliente_endereco) {
    const parts = S.lastOrder.cliente_endereco.split(', ');
    ruaVal    = parts[0] || '';
    numVal    = parts[1] || '';
    compVal   = parts[2] && isNaN(parts[2]) ? parts[2] : '';
    bairroVal = parts[parts.length-1] || '';
  }
  return `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:flex-end">
        <div class="field">
          <label>CEP <span id="ck-cep-spin" style="display:none;font-size:11px">⏳ buscando...</span></label>
          <input id="ck-cep" placeholder="00000-000" maxlength="9"
            oninput="Cardapio._maskCEP(this)"
            onblur="Cardapio._fetchCEP(this.value)"/>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="Cardapio._fetchCEP(document.getElementById('ck-cep').value)" style="margin-bottom:1px">🔍 Buscar CEP</button>
      </div>
      <div class="field">
        <label>Rua / Avenida *</label>
        <input id="ck-rua" placeholder="Nome da rua ou avenida" value="${ruaVal}"/>
      </div>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px">
        <div class="field">
          <label>Número *</label>
          <input id="ck-num" placeholder="Ex: 123" value="${numVal}"/>
        </div>
        <div class="field">
          <label>Bairro *</label>
          <input id="ck-bairro" placeholder="Nome do bairro" value="${bairroVal}"/>
        </div>
      </div>
      <div class="field">
        <label>Complemento</label>
        <input id="ck-comp" placeholder="Apto, bloco, casa..." value="${compVal}"/>
      </div>
    </div>`;
}

function _ckStep4() {
  const taxa = S.config.taxa_entrega_padrao ? parseFloat(S.config.taxa_entrega_padrao) : 0;
  S.deliveryFee = taxa;
  return `
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="ck-section-title">Forma de pagamento</div>
      <div class="pgto-opts">
        ${[['Dinheiro','💵'],['Cartão Débito','💳'],['Cartão Crédito','💳'],['PIX','📱']].map(([p,ic],i) => `
          <div class="pgto-opt">
            <input type="radio" name="pgto" id="pgto${i}" value="${p}" ${i===0?'checked':''}
              onchange="Cardapio._onPgtoChange('${p}')">
            <label for="pgto${i}">${ic}<span>${p}</span></label>
          </div>`).join('')}
      </div>
      <div class="field" id="troco-field" style="display:none">
        <label>Troco para quanto? (R$)</label>
        <input id="ck-troco" type="number" placeholder="Ex: 50"/>
      </div>
      <div style="background:var(--card);border-radius:var(--radius-sm);padding:14px;font-size:13px;display:flex;align-items:center;gap:8px">
        🚚 <strong>Taxa de entrega: ${taxa > 0 ? fmt(taxa) : 'Grátis'}</strong>
      </div>
    </div>`;
}

function _ckStep5() {
  const sub   = S.cart.reduce((s, i) => s + (effPrice(i) * i.qty), 0);
  const total = sub + S.deliveryFee;
  const pgto  = document.querySelector('input[name="pgto"]:checked')?.value || 'Dinheiro';
  const end   = [ge('ck-rua')?.value, ge('ck-num')?.value, ge('ck-comp')?.value, ge('ck-bairro')?.value].filter(Boolean).join(', ');
  return `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div class="summary-row"><span>Subtotal</span><span>${fmt(sub)}</span></div>
      <div class="summary-row"><span>Entrega</span><span>${S.deliveryFee > 0 ? fmt(S.deliveryFee) : 'Grátis'}</span></div>
      <div class="summary-row"><span><strong>Total</strong></span><span style="color:var(--primary);font-size:18px;font-weight:800">${fmt(total)}</span></div>
      <div class="summary-info" style="line-height:1.9">
        📱 <strong>${ge('ck-tel')?.value||''}</strong><br>
        👤 ${ge('ck-nome')?.value||''}<br>
        📍 ${end}<br>
        💳 ${pgto}
        ${ge('ck-obs')?.value ? `<br>📝 ${ge('ck-obs').value}` : ''}
      </div>
      <div style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);border-radius:var(--radius-sm);padding:12px;font-size:12px;color:var(--green);text-align:center;font-weight:600">
        ✅ Após confirmar você acompanha seu pedido em tempo real!
      </div>
    </div>`;
}

// ─── ENTER PARA AVANÇAR CAMPOS ────────────────────────────────────────────────

function _bindEnterKeys() {
  const fields = [...document.querySelectorAll('#ck-content input')];
  fields.forEach((el, idx) => {
    el.removeEventListener('keydown', el._enterHandler);
    el._enterHandler = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const next = fields[idx + 1];
      if (next) next.focus();
      else document.getElementById('ck-next')?.click();
    };
    el.addEventListener('keydown', el._enterHandler);
  });
}

// ─── EVENTOS ──────────────────────────────────────────────────────────────────

function _maskTel(input)  { maskTel(input); }
function _maskCEP(input)  { maskCEP(input); }
function _fetchCEP(val)   { fetchCEP(val); }

async function _onTelBlur(val) {
  await fetchLastOrder(val);
  if (S.lastOrder) {
    const nomeEl = ge('ck-nome');
    if (nomeEl && !nomeEl.value) nomeEl.value = S.lastOrder.cliente_nome;
  }
}

function _onPgtoChange(val) {
  const f = ge('troco-field');
  if (f) f.style.display = val === 'Dinheiro' ? 'grid' : 'none';
}

// ─── NAVEGAÇÃO ────────────────────────────────────────────────────────────────

function _saveVals() {
  const vals = {};
  ['ck-tel','ck-nome','ck-obs','ck-cep','ck-rua','ck-num','ck-bairro','ck-comp','ck-troco'].forEach(id => {
    const el = ge(id); if (el) vals[id] = el.value;
  });
  return vals;
}

function _restoreVals(vals) {
  Object.entries(vals).forEach(([id, v]) => { const el = ge(id); if (el) el.value = v; });
}

function _ckNext() {
  if (S.ckStep === 2) {
    const tel  = onlyDigits(ge('ck-tel')?.value || '');
    const nome = ge('ck-nome')?.value?.trim();
    if (tel.length < 10) { toast('Digite um WhatsApp válido com DDD', 'warn'); ge('ck-tel')?.focus(); return; }
    if (!nome)           { toast('Digite seu nome completo', 'warn'); ge('ck-nome')?.focus(); return; }
  }
  if (S.ckStep === 3) {
    const rua = ge('ck-rua')?.value?.trim();
    const num = ge('ck-num')?.value?.trim();
    if (!rua) { toast('Digite o nome da rua', 'warn'); ge('ck-rua')?.focus(); return; }
    if (!num) { toast('Digite o número', 'warn'); ge('ck-num')?.focus(); return; }
  }
  const vals = _saveVals();
  // Persiste no estado S — campos somem do DOM no step 5 (resumo)
  Object.entries(vals).forEach(([k, v]) => { if (v) S['f_' + k] = v; });
  if (vals['ck-tel'])    S.formTel    = vals['ck-tel'];
  if (vals['ck-nome'])   S.formNome   = vals['ck-nome'];
  if (vals['ck-obs'])    S.formObs    = vals['ck-obs'];
  if (vals['ck-rua'])    S.formRua    = vals['ck-rua'];
  if (vals['ck-num'])    S.formNum    = vals['ck-num'];
  if (vals['ck-bairro']) S.formBairro = vals['ck-bairro'];
  if (vals['ck-comp'])   S.formComp   = vals['ck-comp'];
  if (vals['ck-troco'])  S.formTroco  = vals['ck-troco'];
  // Save payment selection
  const pgtoEl = document.querySelector('input[name="pgto"]:checked');
  if (pgtoEl) S.formPgto = pgtoEl.value;
  S.ckStep++;
  renderCheckoutModal();
  _restoreVals(vals);
  setTimeout(_bindEnterKeys, 80);
}

function _ckPrev() {
  const vals = _saveVals();
  S.ckStep--;
  renderCheckoutModal();
  _restoreVals(vals);
  setTimeout(_bindEnterKeys, 80);
}

function _removeItem(id) {
  removeFromCart(id);
  if (!S.cart.length) { closeModal(); return; }
  const c = ge('ck-content');
  if (c && S.ckStep === 1) c.innerHTML = _ckStep1();
}

function _addItem(id) {
  addToCart(id);
  const c = ge('ck-content');
  if (c && S.ckStep === 1) c.innerHTML = _ckStep1();
}

// ─── PLACE ORDER ──────────────────────────────────────────────────────────────

async function _placeOrder() {
  const btn = ge('ck-next');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }

  const sub   = S.cart.reduce((s, i) => s + (effPrice(i) * i.qty), 0);
  const total = sub + S.deliveryFee;
  const pgto  = S.formPgto || 'Dinheiro';
  const end   = [S.formRua, S.formNum, S.formComp, S.formBairro].filter(Boolean).join(', ');

  const payload = {
    cliente_nome:     S.formNome     || '',
    cliente_endereco: end,
    cliente_telefone: S.formTel      || '',
    pagamento:        pgto,
    troco:            parseFloat(S.formTroco) || null,
    observacoes:      S.formObs      || '',
    itens:            JSON.stringify(S.cart.map(i => ({ id: i.id, nome: i.nome, preco: effPrice(i), qty: i.qty }))),
    subtotal:         sub,
    taxa_entrega:     S.deliveryFee,
    total,
    status:           'recebido',
  };

  const { data, error } = await db.from('pedidos').insert(payload).select().single();
  if (error) {
    toast('Erro ao enviar pedido: ' + error.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Pedido'; }
    return;
  }

  const wpp = onlyDigits(S.config.whatsapp || '');
  if (wpp) {
    const msg = _buildWppMsg(data, payload, sub);
    setTimeout(() => window.open(`https://wa.me/${wpp}?text=${encodeURIComponent(msg)}`, '_blank'), 400);
  }

  S.cart = []; S.deliveryFee = 0; S.lastOrder = null;
  updateCartBadge();
  closeModal();
  toast('Pedido enviado! 🎉', 'success');
  setTimeout(() => showTrack(data.id), 600);
}

function _buildWppMsg(order, payload, sub) {
  const items = JSON.parse(order.itens || '[]');
  return `🛵 *NOVO PEDIDO #${order.id}*\n\n📱 *${payload.cliente_telefone}*\n👤 *${payload.cliente_nome}*\n📍 ${payload.cliente_endereco}\n\n🛒 *Itens:*\n` +
    items.map(i => `• ${i.qty}× ${i.nome} — ${fmt(i.preco * i.qty)}`).join('\n') +
    `\n\n💰 Subtotal: ${fmt(sub)}\n🚚 Entrega: ${S.deliveryFee > 0 ? fmt(S.deliveryFee) : 'Grátis'}` +
    `\n💵 *TOTAL: ${fmt(order.total)}*\n💳 ${payload.pagamento}` +
    (payload.troco ? `\n🔄 Troco: ${fmt(payload.troco)}` : '') +
    (payload.observacoes ? `\n📝 ${payload.observacoes}` : '') +
    `\n\n🔗 Acompanhe: ${location.origin + location.pathname}?track=${order.id}`;
}

// ─── TRACKING ─────────────────────────────────────────────────────────────────

async function showTrack(id) {
  ge('menu-page').style.display  = 'none';
  ge('track-page').style.display = 'block';
  ge('track-label').textContent  = `Pedido #${id}`;
  const { data } = await db.from('pedidos').select('*').eq('id', id).single();
  if (data) renderTrack(data);
  startTrackRealtime(id, renderTrack);
}

function renderTrack(order) {
  const idx = TRACK_STEPS.findIndex(s => s.key === order.status);
  ge('track-steps').innerHTML = TRACK_STEPS.map((s, i) => {
    const done = i < idx, active = i === idx;
    return `<div class="track-step">
      <div class="track-dot ${done?'done':active?'active':'pending'}">${done?'✓':s.icon}</div>
      <div>
        <div class="track-step-title" style="color:${active?'var(--primary)':done?'var(--green)':'var(--muted)'}">${s.label}</div>
        <div class="track-step-desc">${s.desc}</div>
      </div>
    </div>`;
  }).join('');
  const items = JSON.parse(order.itens || '[]');
  const sum = ge('track-summary');
  sum.style.display = 'block';
  sum.innerHTML = `<p style="font-weight:700;margin-bottom:12px;font-size:14px">Resumo do pedido</p>` +
    items.map(i => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:7px 0;border-bottom:1px solid var(--border2);color:var(--text2)"><span>${i.qty}× ${i.nome}</span><span style="font-weight:600">${fmt(i.preco*i.qty)}</span></div>`).join('') +
    `<div style="display:flex;justify-content:space-between;font-weight:800;font-size:17px;padding-top:14px;border-top:1px solid var(--border)"><span>Total</span><span style="color:var(--primary)">${fmt(order.total)}</span></div>`;
}

function backToMenu() {
  stopRealtime();
  ge('track-page').style.display = 'none';
  ge('menu-page').style.display  = 'block';
  history.replaceState({}, '', location.pathname);
}

// ─── MENU ─────────────────────────────────────────────────────────────────────

async function loadMenu() {
  ge('menu-loader').style.display  = 'flex';
  ge('menu-content').style.display = 'none';
  const { data: cfg }   = await db.from('configuracoes').select('*').eq('id', 1).single();
  if (cfg) { S.config = cfg; _applyStoreTheme(cfg); }
  const { data: cats }  = await db.from('categorias').select('*').order('ordem');
  S.categories = cats || [];
  const { data: prods } = await db.from('produtos').select('*,categorias(nome,icone)').eq('ativo', true).order('nome');
  S.products = prods || [];
  renderCatBar();
  renderGrid();
  ge('menu-loader').style.display  = 'none';
  ge('menu-content').style.display = 'block';
}

function renderCatBar() {
  ge('cat-bar').innerHTML = [{ id: 'all', nome: 'Todos', icone: '✨' }, ...S.categories]
    .map(c => `<button class="cat-pill${S.activeCat===c.id?' active':''}" onclick="Cardapio.filterCat('${c.id}')">${c.icone||''} ${c.nome}</button>`)
    .join('');
}

function filterCat(id) { S.activeCat = id; renderCatBar(); renderGrid(); }

function renderGrid() {
  const grid = ge('prod-grid');
  const list = S.activeCat === 'all' ? S.products : S.products.filter(p => String(p.categoria_id) === String(S.activeCat));
  if (!list.length) { grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--muted)">Nenhum produto nesta categoria 😔</div>`; return; }
  grid.innerHTML = list.map(p => _renderProdCard(p)).join('');
}

function _renderProdCard(p) {
  const cartItem = S.cart.find(i => i.id === p.id);
  const qty = cartItem ? cartItem.qty : 0;
  const priceHtml = hasOffer(p)
    ? `<span class="prod-price-old">${fmt(p.preco)}</span><span class="prod-price-new">${fmt(p.preco_oferta)}</span>`
    : `<span class="prod-price-new">${fmt(p.preco)}</span>`;
  const footerBtn = qty > 0
    ? `<div class="prod-qty-ctrl" onclick="event.stopPropagation()">
         <button class="prod-qty-btn" onclick="Cardapio._cardRemove(${p.id})">−</button>
         <span class="prod-qty-num">${qty}</span>
         <button class="prod-qty-btn" onclick="Cardapio._cardAdd(${p.id})">+</button>
       </div>`
    : `<button class="prod-add-btn" onclick="event.stopPropagation();Cardapio._cardAdd(${p.id})">＋ Adicionar</button>`;
  return `
    <div class="prod-card" id="pcard-${p.id}">
      <div class="prod-img-wrap">
        ${p.foto_url ? `<img src="${p.foto_url}" alt="${p.nome}" loading="lazy" onerror="this.parentNode.innerHTML='<div class=\'prod-img-placeholder\'>${S.storeEmoji}</div>'">` : `<div class="prod-img-placeholder">${S.storeEmoji}</div>`}
        <div class="prod-img-overlay"></div>
        <div class="prod-badges">
          ${hasOffer(p) ? `<span class="prod-badge-offer">🔥 OFERTA</span>` : ''}
          ${p.destaque_texto ? `<span class="prod-badge-dest">${p.destaque_texto}</span>` : ''}
        </div>
        <div class="prod-price-area">${priceHtml}</div>
      </div>
      <div class="prod-body">
        <div class="prod-card-name">${p.nome}</div>
        ${p.descricao ? `<div class="prod-desc">${p.descricao}</div>` : ''}
        <div class="prod-footer">
          <span class="prod-delivery${!p.taxa_entrega ? ' free' : ''}">${p.taxa_entrega > 0 ? `🚚 ${fmt(p.taxa_entrega)}` : '🚚 Grátis'}</span>
          ${footerBtn}
        </div>
      </div>
    </div>`;
}

/** Atualiza só o card afetado sem re-renderizar tudo */
function _updateCard(prodId) {
  const p = S.products.find(x => x.id === prodId);
  if (!p) return;
  const el = document.getElementById(`pcard-${prodId}`);
  if (!el) return;
  el.outerHTML = _renderProdCard(p);
}


// ─── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  const params  = new URLSearchParams(location.search);
  const trackId = params.get('track');
  if (trackId) { showTrack(parseInt(trackId)); return; }
  loadMenu();
}

function _cardAdd(id) {
  addToCart(id);
  _updateCard(id);
  updateCartBadge();
}

function _cardRemove(id) {
  removeFromCart(id);
  _updateCard(id);
  updateCartBadge();
}

window.Cardapio = {
  addToCart, openCart, filterCat, backToMenu, showTrack,
  _ckNext, _ckPrev, _addItem, _removeItem, _placeOrder,
  _maskTel, _maskCEP, _fetchCEP, _onTelBlur, _onPgtoChange,
  _cardAdd, _cardRemove,
};

document.addEventListener('DOMContentLoaded', init);
