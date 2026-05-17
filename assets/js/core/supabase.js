/**
 * supabase.js — Cliente Supabase singleton
 * Importar este módulo garante que só existe uma instância do cliente.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const { createClient } = window.supabase;

/** Instância única do Supabase — usar em todos os módulos */
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
