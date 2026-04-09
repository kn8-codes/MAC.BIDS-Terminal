// src/lib/stores/lots.ts
// MAC.BID Terminal — Reactive lots store

import { writable, derived } from 'svelte/store';
import type { Lot, TickerItem } from '$lib/types';

// ── RAW STORE ────────────────────────────────────────────────
export const lots = writable<Lot[]>([]);
export const isPolling = writable<boolean>(false);
export const lastPollTime = writable<Date | null>(null);

// ── DERIVED: active lots only (open, scored, has room) ───────
export const activeLotsStore = derived(lots, ($lots) =>
  $lots.filter(l => l.is_open && l.status === 'active')
);

// ── DERIVED: sorted by closing time (most urgent first) ──────
export const lotsByClosingTime = derived(activeLotsStore, ($lots) =>
  [...$lots].sort((a, b) => {
    if (!a.expected_closing_utc) return 1;
    if (!b.expected_closing_utc) return -1;
    return a.expected_closing_utc - b.expected_closing_utc;
  })
);

// ── DERIVED: ticker feed ─────────────────────────────────────
// Positive score, closing soonest, top 15 per category
export const tickerItems = derived(lots, ($lots): TickerItem[] => {
  const scored = $lots.filter(l =>
    l.is_open &&
    l.score !== null &&
    l.score > 0 &&
    l.has_room !== false &&
    l.expected_closing_utc !== null
  );

  // group by category, take top 15 per category by score
  const byCategory: Record<string, Lot[]> = {};
  for (const lot of scored) {
    const cat = lot.category ?? 'Uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(lot);
  }

  const top15PerCategory = Object.values(byCategory).flatMap(group =>
    [...group]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 15)
  );

  // final sort: soonest closing first
  return top15PerCategory
    .sort((a, b) => (a.expected_closing_utc ?? 0) - (b.expected_closing_utc ?? 0))
    .map(l => ({
      lot_id:               l.id,
      lot_number:           l.lot_number,
      product_name:         l.product_name,
      current_bid:          l.current_bid ?? 0,
      max_bid:              l.max_bid ?? 0,
      score:                l.score ?? 0,
      expected_closing_utc: l.expected_closing_utc ?? 0,
      category:             l.category,
      has_room:             true,
    }));
});

// ── DERIVED: exposure total ───────────────────────────────────
// Sum of all active bid amounts from lots marked as 'bid'
export const totalExposure = derived(lots, ($lots) =>
  $lots
    .filter(l => l.status === 'bid')
    .reduce((sum, l) => sum + (l.current_bid ?? 0), 0)
);