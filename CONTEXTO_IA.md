# CONTEXTO_IA.md — Guia rápido para IAs em novas conversas

> **Envie este arquivo + os arquivos do módulo que quer alterar. A IA entenderá o projeto inteiro.**

---

## O que é este sistema

**DeliveryOS** — Sistema de delivery com cardápio público e painel admin.
Stack: HTML + CSS + JavaScript puro (ES Modules) + Supabase.
Sem React, sem Vue, sem frameworks. Apenas módulos ES nativos.

---

## Estrutura de arquivos

```
/
├── index.html                  ← Cardápio público (cliente final)
├── admin/index.html            ← Shell do painel admin (sidebar + loader de módulos)
│
├── modules/                    ← HTML de cada tela do admin
│   ├── pedidos.html
│   ├── produtos.html
│   ├── categorias.html
│   ├── relatorios.html
│   └── configuracoes.html
│
├── assets/
│   ├── css/
│   │   ├── global.css          ← Variáveis CSS, reset, componentes compartilhados
│   │   ├── admin.css           ← Estilos exclusivos do admin
│   │   └── cardapio.css        ← Estilos exclusivos do cardápio público
│   │
│   └── js/
│       ├── cardapio.js         ← Lógica completa do cardápio público
│       │
│       ├── core/               ← Utilitários compartilhados — NÃO contêm lógica de negócio
│       │   ├── config.js       ← Constantes: Supabase URL/KEY, KANBAN_COLS, TRACK_STEPS
│       │   ├── supabase.js     ← Singleton do cliente Supabase (export: db)
│       │   ├── state.js        ← Estado global do admin (State.get/set/update)
│       │   ├── helpers.js      ← Funções puras: fmt, ge, fmtDate, exportCSV, masks
│       │   ├── ui.js           ← Toast, Modal, applyTheme, spinnerHTML
│       │   ├── realtime.js     ← startOrdersRealtime, startTrackRealtime, stopRealtime
│       │   └── storage.js      ← localStorage helpers (CartStorage, DeliveryStorage)
│       │
│       └── modules/            ← Lógica JS de cada módulo do admin
│           ├── pedidos.js
│           ├── produtos.js
│           ├── categorias.js
│           ├── relatorios.js
│           └── configuracoes.js
```

---

## Como o admin carrega módulos

`admin/index.html` é o **shell**. Ele tem sidebar, header e um `<div id="module-container">`.

Quando o usuário clica em um item da sidebar:
```js
Admin.loadModule('pedidos', navEl)
```

Isso:
1. Faz `fetch('../modules/pedidos.html')` e injeta no `#module-container`
2. Faz `import('../assets/js/modules/pedidos.js')` (uma só vez, cached)
3. Chama `mod.init()` do módulo

**Resultado:** cada módulo é independente. Editar `pedidos.js` não afeta `produtos.js`.

---

## Supabase — tabelas usadas

| Tabela | Colunas principais |
|---|---|
| `configuracoes` | id=1, nome_fantasia, logo_emoji, descricao, whatsapp, telefone, cep, logradouro, numero, bairro, cidade, complemento, razao_social, cnpj, ie, taxa_entrega_padrao, cor_bg, cor_surface, cor_card, cor_primary, cor_accent, cor_text, cor_muted |
| `categorias` | id, nome, icone, ordem |
| `produtos` | id, nome, descricao, preco, preco_oferta, taxa_entrega, foto_url, destaque_texto, ativo, categoria_id |
| `pedidos` | id, cliente_nome, cliente_endereco, cliente_telefone, pagamento, troco, observacoes, itens (JSON string), subtotal, taxa_entrega, total, status, created_at |

**Status de pedidos (fluxo):**
`recebido` → `aceito` → `preparando` → `entrega` → `finalizado`

**itens** é JSON string: `[{id, nome, preco, qty}]`

---

## Padrões obrigatórios

### Como criar/editar um módulo

1. Criar `modules/NOME.html` — apenas HTML, sem `<script>` inline
2. Criar `assets/js/modules/NOME.js` — ES Module com `export function init()`
3. Expor funções para onclick do HTML via `window.NOME = { ... }` no final do arquivo JS
4. Adicionar item na sidebar do `admin/index.html`

### Regras de código

- **Sempre** usar `import { db } from '../core/supabase.js'`
- **Sempre** usar `import { toast, buildModal } from '../core/ui.js'`
- **Sempre** usar `import { ge, fmt } from '../core/helpers.js'`
- **Nunca** criar variáveis globais soltas — usar `State.get/set` ou estado local do módulo
- **Nunca** colocar CSS inline que deveria estar no CSS global
- **Nunca** duplicar funções que já existem em `helpers.js` ou `ui.js`
- **Nunca** misturar lógica de módulos diferentes no mesmo arquivo

### Padrão de modal

```js
import { buildModal, openModal } from '../core/ui.js';

openModal(buildModal({
  title: 'Título',
  body: `<div>...HTML...</div>`,
  actions: `<button class="btn btn-primary" onclick="Modulo.save()">Salvar</button>`,
}));

// Para fechar: window.__closeModal()
```

### Padrão de toast

```js
toast('Mensagem', 'success'); // success | error | warn | info
```

---

## Realtime

O admin shell (`admin/index.html`) inicia o realtime global e delega para os módulos:

```js
startOrdersRealtime({
  onInsert: (order) => { /* novo pedido */ },
  onUpdate: (order) => { /* pedido atualizado */ },
});
```

Os módulos exportam `onNewOrder(order)` e `onOrderUpdate(order)` para receber eventos.

O cardápio público usa `startTrackRealtime(orderId, callback)` para tracking.

---

## Como editar sem quebrar outros módulos

- Se for editar pedidos: edite apenas `modules/pedidos.html` + `assets/js/modules/pedidos.js`
- Se for editar visual: edite `assets/css/admin.css` ou `global.css`
- Se for editar utilitário compartilhado (fmt, toast): edite `core/helpers.js` ou `core/ui.js`
- Se for editar config Supabase: edite apenas `core/config.js`
- **Nunca** edite `admin/index.html` para adicionar lógica de negócio — ele é apenas shell

---

## CSS — variáveis principais

```css
--primary: #6C63FF      /* cor principal, botões, destaques */
--accent:  #FF6B6B      /* vermelho para alertas/erros */
--green:   #4ADE80      /* sucesso, ativo */
--bg:      #0B0C0E      /* fundo da página */
--surface: #13151A      /* cards grandes */
--card:    #1C1F27      /* cards internos */
--text:    #F1F2F6      /* texto principal */
--muted:   #6B7280      /* texto secundário */
```

Todas as cores vêm de variáveis. O tema pode ser customizado em Configurações → Tema de Cores.

---

## Checklist para nova IA

- [ ] Leu este arquivo?
- [ ] Sabe qual módulo precisa editar?
- [ ] Vai usar ES Modules (`import/export`)?
- [ ] Vai usar `State.get/set` para estado compartilhado?
- [ ] Vai expor funções via `window.NomeModulo = {}`?
- [ ] Não vai criar globals soltos?
- [ ] Não vai duplicar helpers?
