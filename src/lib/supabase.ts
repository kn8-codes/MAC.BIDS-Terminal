// src/lib/supabase.ts
// MAC.BID Terminal — Supabase client

import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

export const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

// ── LOTS ─────────────────────────────────────────────────────

export async function fetchActiveLots() {
  const { data, error } = await supabase
    .from('lots')
    .select(`*, auction:auctions(*)`)
    .eq('is_open', true)
    .order('expected_closing_utc', { ascending: true });

  if (error) throw error;
  return data;
}

export async function upsertLot(lot: Record<string, unknown>) {
  const { error } = await supabase
    .from('lots')
    .upsert(lot, { onConflict: 'id' });

  if (error) throw error;
}

export async function updateLotStatus(lot_id: number, status: string) {
  const { error } = await supabase
    .from('lots')
    .update({ status })
    .eq('id', lot_id);

  if (error) throw error;
}

export async function updateLotScore(
  lot_id: number,
  fields: {
    current_bid?: number;
    ebay_comp_price?: number;
    ebay_comp_url?: string;
    ebay_comp_source?: string;
    max_bid?: number;
    local_max_bid?: number;
    score?: number;
    estimated_shipping?: number;
  }
) {
  const { error } = await supabase
    .from('lots')
    .update({ ...fields, ebay_comp_updated_at: new Date().toISOString() })
    .eq('id', lot_id);

  if (error) throw error;
}

// ── PORTFOLIO ────────────────────────────────────────────────

export async function fetchPortfolio() {
  const { data, error } = await supabase
    .from('portfolio')
    .select(`*, lot:lots(*)`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function addPortfolioEntry(entry: Record<string, unknown>) {
  const { error } = await supabase
    .from('portfolio')
    .insert(entry);

  if (error) throw error;
}

export async function updatePortfolioEntry(id: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('portfolio')
    .update(fields)
    .eq('id', id);

  if (error) throw error;
}

// ── SETTINGS ─────────────────────────────────────────────────

export async function fetchSettings() {
  const { data, error } = await supabase
    .from('settings')
    .select('*');

  if (error) throw error;

  // convert array of {key, value} rows into a flat object
  return Object.fromEntries(data.map(r => [r.key, r.value]));
}

export async function updateSetting(key: string, value: string) {
  const { error } = await supabase
    .from('settings')
    .update({ value })
    .eq('key', key);

  if (error) throw error;
}