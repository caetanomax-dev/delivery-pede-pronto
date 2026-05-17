# README_SISTEMA.md — DeliveryOS

Sistema de delivery completo com cardápio público e painel administrativo.

---

## Stack

- HTML5 + CSS3 + JavaScript (ES Modules nativos)
- Supabase (banco de dados + realtime)
- Sem frameworks, sem build step, sem npm

---

## Como rodar

Não precisa de build. Abra com qualquer servidor estático:

```bash
# Opção 1: VS Code Live Server (extensão)
# Clique em "Go Live" com index.html aberto

# Opção 2: Python
python -m http.server 3000

# Opção 3: Node
npx serve .
```

**Importante:** deve ser servido via HTTP (não abrir o arquivo direto), pois ES Modules precisam de servidor.

---

## Configurar Supabase

Edite `assets/js/core/config.js`:

```js
export const SUPABASE_URL = 'sua-url-aqui';
export const SUPABASE_ANON_KEY = 'sua-chave-aqui';
```

---

## Tabelas Supabase necessárias

### configuracoes
```sql
CREATE TABLE configuracoes (
  id integer PRIMARY KEY DEFAULT 1,
  nome_fantasia text,
  razao_social text,
  cnpj text,
  ie text,
  descricao text,
  logo_emoji text,
  cep text,
  logradouro text,
  numero text,
  bairro text,
  cidade text,
  complemento text,
  whatsapp text,
  telefone text,
  taxa_entrega_padrao numeric DEFAULT 0,
  cor_bg text,
  cor_surface text,
  cor_card text,
  cor_primary text,
  cor_accent text,
  cor_text text,
  cor_muted text
);
INSERT INTO configuracoes (id) VALUES (1);
```

### categorias
```sql
CREATE TABLE categorias (
  id serial PRIMARY KEY,
  nome text NOT NULL,
  icone text,
  ordem integer DEFAULT 1
);
```

### produtos
```sql
CREATE TABLE produtos (
  id serial PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  preco numeric NOT NULL,
  preco_oferta numeric,
  taxa_entrega numeric DEFAULT 0,
  foto_url text,
  destaque_texto text,
  ativo boolean DEFAULT true,
  categoria_id integer REFERENCES categorias(id)
);
```

### pedidos
```sql
CREATE TABLE pedidos (
  id serial PRIMARY KEY,
  cliente_nome text NOT NULL,
  cliente_endereco text,
  cliente_telefone text,
  pagamento text,
  troco numeric,
  observacoes text,
  itens text,          -- JSON string: [{id, nome, preco, qty}]
  subtotal numeric,
  taxa_entrega numeric DEFAULT 0,
  total numeric,
  status text DEFAULT 'recebido',
  created_at timestamptz DEFAULT now()
);
```

### Realtime
Habilite Realtime na tabela `pedidos` no dashboard do Supabase:
`Database → Replication → Enabled for: pedidos`

### RLS (Row Level Security)
Para desenvolvimento, pode deixar desabilitado. Para produção, configure policies adequadas.

---

## Estrutura de páginas

| URL | Descrição |
|---|---|
| `/index.html` | Cardápio público para o cliente final |
| `/index.html?track=123` | Tracking do pedido #123 |
| `/admin/index.html` | Painel administrativo |

---

## Fluxo do pedido

1. Cliente acessa `index.html`
2. Adiciona produtos ao carrinho
3. Preenche dados (nome, endereço, telefone)
4. Escolhe pagamento
5. Confirma → pedido inserido no Supabase com `status: 'recebido'`
6. WhatsApp é aberto com resumo do pedido
7. Cliente é redirecionado para tracking em tempo real

No admin:
1. Som de notificação toca ao receber novo pedido
2. Kanban atualiza automaticamente via realtime
3. Admin avança o status: Recebido → Aceito → Preparando → Entrega → Finalizado
4. Ao finalizar, pode enviar mensagem de entrega via WhatsApp

---

## Como adicionar um novo módulo

1. Criar `modules/NOME.html` com o HTML da tela
2. Criar `assets/js/modules/NOME.js` com `export function init()` e `window.NOME = {}`
3. Adicionar na sidebar do `admin/index.html`:
```html
<div class="sb-item" data-mod="NOME" onclick="Admin.loadModule('NOME', this)">
  <span class="sb-icon">🆕</span>Nome do Módulo
</div>
```

---

## Arquivos de documentação

| Arquivo | Conteúdo |
|---|---|
| `README_SISTEMA.md` | Este arquivo — visão geral e setup |
| `ARQUITETURA.md` | Arquitetura técnica detalhada |
| `PADROES_DESENVOLVIMENTO.md` | Regras de código para o time |
| `CONTEXTO_IA.md` | Guia rápido para futuras IAs |
