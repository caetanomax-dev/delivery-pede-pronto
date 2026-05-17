/**
 * helpers.js — Funções utilitárias puras
 * Sem efeitos colaterais. Sem acesso ao DOM. Sem Supabase.
 * Fácil de testar e reutilizar em qualquer módulo.
 */

/** Formata valor para moeda BRL */
export const fmt = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

/** Atalho getElementById */
export const ge = (id) => document.getElementById(id);

/** Formata data/hora em pt-BR */
export const fmtDate = (iso, opts = {}) =>
  new Date(iso).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', ...opts });

/** Retorna data YYYY-MM-DD de um Date */
export const toDateStr = (d) => d.toISOString().split('T')[0];

/** Verifica se dois Date são o mesmo dia */
export const sameDay = (a, b) =>
  new Date(a).toDateString() === new Date(b).toDateString();

/** Remove não-dígitos */
export const onlyDigits = (s) => String(s).replace(/\D/g, '');

/** Máscara CNPJ */
export function maskCNPJ(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 14);
  v = v.replace(/^(\d{2})(\d)/, '$1.$2');
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
  v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
  v = v.replace(/(\d{4})(\d)/, '$1-$2');
  input.value = v;
}

/** Máscara CEP */
export function maskCEP(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, '$1-$2');
  input.value = v;
}

/** Máscara WhatsApp */
export function maskWPP(input) {
  input.value = input.value.replace(/\D/g, '').slice(0, 15);
}

/** Gera texto de mensagem WhatsApp de entrega */
export function buildDeliveryWppMsg(order, storeName) {
  return `🎉 Olá ${order.cliente_nome}! Seu pedido *#${order.id}* foi *entregue com sucesso*!\nObrigado pela preferência! 😊\n\n${storeName || ''}`;
}

/** Exporta array de objetos para CSV e faz download */
export function exportCSV(rows, filename = 'relatorio.csv') {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
