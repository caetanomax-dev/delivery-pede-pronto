/**
 * config.js — Configurações centrais do sistema
 * Altere apenas SUPABASE_URL e SUPABASE_ANON_KEY para conectar ao seu projeto.
 */

export const SUPABASE_URL = 'https://oscuwqgflgumlfejqyoq.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zY3V3cWdmbGd1bWxmZWpxeW9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3ODI5MDYsImV4cCI6MjA5NDM1ODkwNn0.I1f4Wu5U2LA_7NcOP_TrA7H2N460lOectZ1oxnDO2Cc';

export const NOTIF_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

/** Mapeamento status → próximo status kanban */
export const KANBAN_COLS = [
  { key: 'recebido',   label: 'Recebidos',   color: '#D4A43A', next: 'aceito',     nextLabel: 'Aceitar'  },
  { key: 'aceito',     label: 'Aceitos',      color: '#4A9FE0', next: 'preparando', nextLabel: 'Preparar' },
  { key: 'preparando', label: 'Em Preparo',   color: '#9B6FD4', next: 'entrega',    nextLabel: 'Enviar'   },
  { key: 'entrega',    label: 'Em Entrega',   color: '#3DB87A', next: 'finalizado', nextLabel: 'Finalizar'},
];

/** Etapas de tracking para o cliente */
export const TRACK_STEPS = [
  { key: 'recebido',   label: 'Pedido Recebido',      icon: '📥', desc: 'Seu pedido foi recebido'             },
  { key: 'aceito',     label: 'Pedido Confirmado',     icon: '✅', desc: 'A loja confirmou seu pedido'         },
  { key: 'preparando', label: 'Em Preparo',            icon: '⚙️', desc: 'Estamos preparando com cuidado'     },
  { key: 'entrega',    label: 'Saiu para Entrega',     icon: '🚚', desc: 'Seu pedido está a caminho!'          },
  { key: 'finalizado', label: 'Entregue!',             icon: '🎉', desc: 'Aproveite! Obrigado pela preferência 😊' },
];

export const STATUS_COLORS = {
  recebido:   '#D4A43A',
  aceito:     '#4A9FE0',
  preparando: '#9B6FD4',
  entrega:    '#3DB87A',
  finalizado: '#3DB87A',
};

export const HIST_PER_PAGE = 10;
