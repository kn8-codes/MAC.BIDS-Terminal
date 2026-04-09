// src/lib/stores/portfolio.ts
// MAC.BID Terminal — Reactive portfolio store

import { writable, derived } from 'svelte/store';
import type { PortfolioEntry } from '$lib/types';

// ── RAW STORE ────────────────────────────────────────────────
export const portfolio = writable<PortfolioEntry[]>([]);

// ── DERIVED: by status ───────────────────────────────────────
export const activeBids = derived(portfolio, ($p) =>
  $p.filter(e => e.status === 'bid')
);

export const wonLots = derived(portfolio, ($p) =>
  $p.filter(e => e.status === 'won')
);

export const listedLots = derived(portfolio, ($p) =>
  $p.filter(e => e.status === 'listed')
);

export const soldLots = derived(portfolio, ($p) =>
  $p.filter(e => e.status === 'sold')
);

// ── DERIVED: P&L ─────────────────────────────────────────────
export const realizedProfit = derived(soldLots, ($sold) =>
  $sold.reduce((sum, e) => sum + (e.net_profit ?? 0), 0)
);

export const totalBidExposure = derived(activeBids, ($bids) =>
  $bids.reduce((sum, e) => sum + (e.bid_amount ?? 0), 0)
);

// ── DERIVED: liquidation clock alerts ────────────────────────
// Won lots older than 14 days need attention
export const liquidationAlerts = derived(wonLots, ($won) => {
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  return $won.filter(e => {
    const age = Date.now() - new Date(e.created_at).getTime();
    return age > fourteenDaysMs;
  });
});

// ── DERIVED: lots won this month ─────────────────────────────
export const wonsThisMonth = derived(portfolio, ($p) => {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return $p.filter(e =>
    e.status === 'won' &&
    new Date(e.created_at) >= start
  ).length;
});