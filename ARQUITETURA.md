# ARQUITETURA.md — DeliveryOS

---

## Visão geral

```
┌─────────────────────────────────────────────────────┐
│                    BROWSER                          │
│                                                     │
│   index.html          admin/index.html              │
│   (Cardápio)          (Admin Shell)                 │
│       │                    │                        │
│   cardapio.js         Carrega módulos dinamicamente │
│       │               /modules/*.html               │
│       │               /js/modules/*.js              │
│       │                    │                        │
│   ────┴────────────────────┴──────                  │
│              core/ (compartilhado)                  │
│    supabase.js  state.js  helpers.js                │
│    ui.js        realtime.js  config.js              │
└─────────────────────────────────────────────────────┘
              │
        Supabase Cloud
     (PostgreSQL + Realtime)
```

---

## Responsabilidade de cada arquivo

### `assets/js/core/config.js`
- Constantes globais imutáveis
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `KANBAN_COLS`, `TRACK_STEPS`, `STATUS_COLORS`
- **Não contém** lógica, apenas dados

### `assets/js/core/supabase.js`
- Instancia o cliente Supabase **uma única vez**
- Exporta `db` — todos os outros arquivos importam daqui
- **Nunca** chame `createClient` em outro lugar

### `assets/js/core/state.js`
- Estado global do admin: `config`, `categories`, `products`, `orders`
- API: `State.get(key)`, `State.set(key, val)`, `State.update(key, fn)`
- **Não contém** lógica de UI nem Supabase

### `assets/js/core/helpers.js`
- Funções puras sem efeitos colaterais
- `fmt(v)` — formata moeda BRL
- `ge(id)` — atalho para `document.getElementById`
- `fmtDate(iso)` — formata data pt-BR
- `exportCSV(rows, filename)` — download CSV
- `maskCNPJ`, `maskCEP`, `maskWPP` — máscaras de input

### `assets/js/core/ui.js`
- Componentes de UI compartilhados
- `toast(msg, type)` — notificação flutuante
- `openModal(html)` / `closeModal()` — modal genérico
- `buildModal({title, body, actions})` — constrói HTML do modal
- `applyTheme(cfg)` — aplica cores do Supabase no CSS
- `spinnerHTML` — HTML do spinner de loading

### `assets/js/core/realtime.js`
- Gerencia canais Supabase Realtime
- `startOrdersRealtime({onInsert, onUpdate})` — para o admin
- `startTrackRealtime(orderId, onUpdate)` — para o cliente
- `stopRealtime()` — limpa o canal ativo
- Auto-reconexão em caso de `CLOSED` ou `CHANNEL_ERROR`

### `assets/js/core/storage.js`
- Isola todo acesso a `localStorage`
- `CartStorage.get/set/clear()` — carrinho do cliente
- `DeliveryStorage.get/set/clear()` — taxa de entrega

---

## Fluxo de dados — Admin

```
admin/index.html (shell)
    │
    ├── init()
    │     ├── db.from('configuracoes') → State.set('config')
    │     ├── db.from('categorias') → State.set('categories')
    │     └── startOrdersRealtime({ onInsert, onUpdate })
    │
    └── loadModule('pedidos')
          ├── fetch('modules/pedidos.html') → injeta no DOM
          ├── import('js/modules/pedidos.js')
          └── pedidos.init()
                └── db.from('pedidos') → renderiza kanban
```

---

## Fluxo de dados — Cardápio

```
index.html
    │
    └── cardapio.js init()
          │
          ├── ?track=123 → showTrack(123)
          │     ├── db.from('pedidos').eq('id',123)
          │     └── startTrackRealtime(123, renderTrack)
          │
          └── loadMenu()
                ├── db.from('configuracoes') → applyTheme
                ├── db.from('categorias') → renderCatBar
                └── db.from('produtos') → renderGrid
```

---

## Organização do estado

### Admin (State)
```
State = {
  config:      { nome_fantasia, logo_emoji, whatsapp, ... }
  categories:  [{ id, nome, icone, ordem }]
  products:    [{ id, nome, preco, ... }]
  orders:      { recebido: [], aceito: [], preparando: [], entrega: [] }
  finalizados: []
  newCount:    number
  currentPage: string
}
```

### Cardápio (variáveis locais em cardapio.js)
```
S = {
  config, categories, products,
  cart: [{ ...produto, qty }],
  deliveryFee: number,
  activeCat: 'all' | categoria_id,
  storeEmoji: string,
  ckStep: 1..4
}
```

---

## Comunicação entre módulos

Os módulos **não** se importam entre si diretamente.

Comunicação ocorre via:
1. **State** — dados compartilhados lidos/escritos via `State.get/set`
2. **Eventos do shell** — admin chama `mod.onNewOrder()` e `mod.onOrderUpdate()`
3. **DOM** — funções expostas em `window.NomeModulo = {}` para onclick inline

---

## O que NÃO fazer

- ❌ Importar um módulo dentro de outro módulo (`pedidos.js` importando `produtos.js`)
- ❌ Usar variáveis globais soltas (`window.x = 123`)
- ❌ Duplicar `createClient` fora de `supabase.js`
- ❌ Colocar lógica de negócio no `admin/index.html`
- ❌ Criar CSS em arquivos HTML (usar os arquivos CSS)
- ❌ Fazer `document.getElementById` sem o helper `ge()`
- ❌ Formatar moeda sem `fmt()`
