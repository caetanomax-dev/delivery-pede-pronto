# PADROES_DESENVOLVIMENTO.md — DeliveryOS

Regras obrigatórias. Seguir sempre, inclusive ao usar IA para editar o código.

---

## Regras gerais

### ✅ Sempre fazer

- Usar ES Modules (`import/export`) em todos os arquivos JS
- Usar `async/await` (nunca `.then()` encadeado em produção)
- Usar `State.get/set` para dados compartilhados entre módulos
- Usar `ge(id)` ao invés de `document.getElementById(id)`
- Usar `fmt(v)` ao invés de formatar moeda manualmente
- Usar `toast(msg, type)` para feedbacks ao usuário
- Expor funções para onclick via `window.NomeModulo = { funcao }`
- Verificar se elemento existe antes de manipular: `if (el) el.value = x`

### ❌ Nunca fazer

- Criar arquivos HTML gigantes com centenas de linhas de JS embutido
- Usar `var` (usar `const` e `let`)
- Usar `innerHTML` para injetar dados de usuário sem sanitizar
- Criar `createClient(SUPABASE_URL, KEY)` fora de `core/supabase.js`
- Duplicar funções que já existem em `core/helpers.js`
- Misturar lógica de módulos diferentes
- Usar jQuery, Bootstrap, ou qualquer lib não aprovada
- Fazer chamadas Supabase fora dos módulos ou do cardapio.js

---

## Padrão de um módulo completo

### HTML (`modules/NOME.html`)
```html
<!-- modules/nome.html — Módulo de X -->

<div style="display:flex;flex-direction:column;gap:22px">
  <div class="page-header">
    <h2 class="page-title">Título</h2>
    <button class="btn btn-primary" onclick="Nome.openForm()">+ Novo</button>
  </div>
  <div id="nome-list">
    <div class="loading-wrap"><div class="spinner"></div></div>
  </div>
</div>
```

**Regras do HTML do módulo:**
- Sem `<script>` inline
- Sem `<style>` inline
- Sem imports de CSS/JS (o shell já carrega tudo)
- Usar apenas classes de `global.css` e `admin.css`
- Funções nos `onclick` devem estar em `window.NomeModulo`

---

### JS (`assets/js/modules/nome.js`)
```js
/**
 * nome.js — Módulo de X
 * Responsabilidades: ...
 */

import { db } from '../core/supabase.js';
import { toast, buildModal, openModal, spinnerHTML } from '../core/ui.js';
import { fmt, ge } from '../core/helpers.js';
import State from '../core/state.js';

// Estado local do módulo (não vai para State global)
let _items = [];

// Função de inicialização — chamada pelo admin shell
export async function init() {
  await load();
}

// Carrega dados do Supabase
export async function load() {
  ge('nome-list').innerHTML = spinnerHTML;
  const { data, error } = await db.from('tabela').select('*');
  if (error) { toast('Erro ao carregar', 'error'); return; }
  _items = data || [];
  _render();
}

// Renderiza o HTML
function _render() {
  const wrap = ge('nome-list');
  if (!_items.length) { wrap.innerHTML = `<p>Nenhum item</p>`; return; }
  wrap.innerHTML = _items.map(item => `
    <div class="prod-row">
      <span>${item.nome}</span>
      <button class="btn btn-ghost btn-sm" onclick="Nome.openForm(${item.id})">Editar</button>
    </div>`).join('');
}

// Abre modal de criação/edição
export function openForm(id = null) {
  const item = id ? _items.find(i => i.id === id) : null;
  openModal(buildModal({
    title: item ? 'Editar' : 'Novo',
    body: `<div class="field"><label>Nome</label><input id="ni-nome" value="${item?.nome || ''}"/></div>`,
    actions: `
      <button class="btn btn-primary" onclick="Nome.save(${id || 'null'})">Salvar</button>
      <button class="btn btn-ghost" onclick="window.__closeModal()">Cancelar</button>`,
  }));
}

// Salva no Supabase
export async function save(id) {
  const payload = { nome: ge('ni-nome').value.trim() };
  if (!payload.nome) { toast('Preencha o nome', 'warn'); return; }
  const q = id ? db.from('tabela').update(payload).eq('id', id) : db.from('tabela').insert(payload);
  const { error } = await q;
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Salvo!', 'success');
  window.__closeModal();
  await load();
}

// Exposição para onclick inline
window.Nome = { load, openForm, save };
```

---

## Tamanho dos arquivos

| Tipo | Limite recomendado |
|---|---|
| Módulo HTML | 80 linhas |
| Módulo JS | 200 linhas |
| CSS por arquivo | 300 linhas |
| Função JS | 30 linhas |

Se ultrapassar: refatorar, dividir responsabilidades.

---

## Como IA deve editar o sistema

### Regra de ouro
**Nunca edite dois módulos diferentes na mesma resposta.** Faça uma coisa por vez.

### Passos para editar um módulo existente
1. Receba `CONTEXTO_IA.md` + o arquivo do módulo
2. Entenda o que precisa mudar
3. Edite **apenas** os arquivos do módulo pedido
4. Não toque em `core/`, `admin/index.html`, ou outros módulos

### Passos para criar um novo módulo
1. Criar `modules/NOME.html`
2. Criar `assets/js/modules/NOME.js`
3. Adicionar item na sidebar do `admin/index.html` (único caso de editar o shell)
4. Não criar novos arquivos CSS (usar as classes existentes)

### O que a IA NÃO deve fazer
- Refatorar o projeto inteiro numa resposta só
- Criar arquivos CSS novos sem necessidade
- Alterar `core/` sem instrução explícita
- Inventar novas tabelas Supabase
- Usar `.then()` quando pode usar `async/await`
- Criar variáveis `window.x` fora do padrão `window.NomeModulo`

---

## Classes CSS disponíveis

Do `global.css`:
- **Botões:** `.btn .btn-primary .btn-ghost .btn-danger .btn-success .btn-sm .btn-icon`
- **Cards:** `.card .card-sm`
- **Forms:** `.field .field-row`
- **Toggle:** `.tog`
- **Modal:** `.modal-overlay .modal-box .modal-head .modal-title .modal-close .modal-actions`
- **Badges:** `.badge`
- **Loading:** `.spinner .loading-wrap .skeleton-card`
- **Stats:** `.stats-grid .stat-card .stat-val .stat-label`
- **Realtime:** `.rt-dot .rt-pulse`

Do `admin.css`:
- **Kanban:** `.k-col .k-col-head .k-card .k-card-foot .k-advance .k-empty`
- **Histórico:** `.hist-table .hist-pag .hist-pag-btn`
- **Produtos:** `.prod-row .prod-img .prod-info .prod-name .prod-actions`
- **Tabs:** `.sub-tabs .sub-tab`
- **Config:** `.cfg-grid .cfg-title .color-row`

---

## Checklist de PR / revisão

Antes de dar qualquer código como pronto, verificar:

- [ ] Usa ES Modules (`import/export`)?
- [ ] Tem `export function init()`?
- [ ] Expõe `window.NomeModulo`?
- [ ] Usa `State` para dados compartilhados?
- [ ] Usa `ge()` e `fmt()` dos helpers?
- [ ] Usa `toast()` para feedback?
- [ ] Usa `buildModal()` para modais?
- [ ] Sem globals soltos?
- [ ] Sem duplicação de helpers?
- [ ] Sem CSS inline que deveria ser classe?
- [ ] Funções têm no máximo ~30 linhas?
