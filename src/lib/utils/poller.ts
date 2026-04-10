// src/lib/utils/poller.ts
// MAC.BID Terminal — Live API poller
// Hits /search + /turbo-clock-auctions, scores each lot, upserts to Supabase.
//
// Polling schedule:
//   Every 5 min  → /search (current_bid live data)
//   Every 5 min  → /turbo-clock-auctions (full turbo feed)
//   Every 30 min → /auctions/{id} for full item detail on discovered auctions

import type { MacBidSearchHit, MacBidAuction, MacBidItem, Lot } from '$lib/types';
import { score } from '$lib/utils/scoring';
import { lots, isPolling, lastPollTime } from '$lib/stores/lots';
import { upsertLot } from '$lib/supabase';

const BASE_URL = 'https://api.macdiscount.com';
const POLL_INTERVAL_FAST   = 5 * 60 * 1000;
const POLL_INTERVAL_DETAIL = 30 * 60 * 1000;
const DEFAULT_SHIPPING = 15;

const SEARCH_KEYWORDS = [
  'laptop','macbook','ipad','iphone','tools','dewalt',
  'milwaukee','sony','samsung','monitor','headphones',
  'camera','gaming','printer','tablet',
];

const auctionCache = new Map<number, { lot_fee_override: number | null; buyers_premium_override: number | null }>();
const detailedAuctionIds = new Set<number>();

let fastPollTimer: ReturnType<typeof setInterval> | null = null;
let detailPollTimer: ReturnType<typeof setInterval> | null = null;

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`MAC.BID API ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

function politeDelay(): Promise<void> {
  return new Promise(r => setTimeout(r, 500 + Math.random() * 1500));
}

function pickKeywords(n = 3): string[] {
  return [...SEARCH_KEYWORDS].sort(() => Math.random() - 0.5).slice(0, n);
}

async function pollSearch(): Promise<MacBidSearchHit[]> {
  const hits: MacBidSearchHit[] = [];
  const seen = new Set<number>();
  for (const q of pickKeywords(3)) {
    await politeDelay();
    try {
      const data = await apiFetch<{ hits: MacBidSearchHit[] }>(`/search?q=${encodeURIComponent(q)}&hitsPerPage=49`);
      for (const hit of data.hits ?? []) {
        if (!seen.has(hit.lot_id)) { seen.add(hit.lot_id); hits.push(hit); }
      }
    } catch (err) { console.warn(`[poller] /search?q=${q} failed:`, err); }
  }
  return hits;
}

async function pollTurbo(): Promise<MacBidAuction[]> {
  await politeDelay();
  try { return await apiFetch<MacBidAuction[]>('/turbo-clock-auctions'); }
  catch (err) { console.warn('[poller] /turbo-clock-auctions failed:', err); return []; }
}

async function fetchAuctionDetail(auction_id: number): Promise<MacBidAuction | null> {
  await politeDelay();
  try { return await apiFetch<MacBidAuction>(`/auctions/${auction_id}`); }
  catch (err) { console.warn(`[poller] /auctions/${auction_id} failed:`, err); return null; }
}

function scoreHit(hit: MacBidSearchHit): Partial<Lot> {
  const auction = auctionCache.get(Number(hit.auction_id)) ?? { lot_fee_override: null, buyers_premium_override: null };
  const ebay_comp_price = hit.retail_price > 0 ? hit.retail_price * 0.55 : 0;
  const estimated_shipping = hit.is_shippable ? DEFAULT_SHIPPING : 0;
  const result = ebay_comp_price > 0 ? score({ current_bid: hit.current_bid, ebay_comp_price, estimated_shipping, is_shippable: hit.is_shippable, auction }) : null;
  return {
    id: hit.lot_id, auction_id: Number(hit.auction_id), lot_number: hit.lot_number,
    product_name: hit.product_name, condition_name: hit.condition, category: hit.category,
    retail_price: hit.retail_price, is_pallet: Boolean(hit.is_pallet), is_shippable: hit.is_shippable,
    is_transferrable: hit.is_transferrable, is_open: Boolean(hit.is_open), upc: hit.upc || null,
    image_url: hit.image_url || null, expected_closing_utc: hit.expected_closing_utc,
    current_bid: hit.current_bid, ebay_comp_price: ebay_comp_price > 0 ? ebay_comp_price : null,
    ebay_comp_source: 'keyword', estimated_shipping,
    max_bid: result?.max_bid ?? null, local_max_bid: result?.local_max_bid ?? null,
    score: result?.score ?? null, status: 'active',
  };
}

function scoreItem(item: MacBidItem, auction: MacBidAuction): Partial<Lot> {
  const auctionFees = { lot_fee_override: auction.lot_fee_override, buyers_premium_override: auction.buyers_premium_override };
  const ebay_comp_price = item.retail_price > 0 ? item.retail_price * 0.55 : 0;
  const estimated_shipping = item.is_shippable ? Math.max(item.shipping_weight * 0.75 + 5, DEFAULT_SHIPPING) : 0;
  const result = ebay_comp_price > 0 ? score({ current_bid: 0, ebay_comp_price, estimated_shipping, is_shippable: Boolean(item.is_shippable), auction: auctionFees }) : null;
  return {
    id: item.id, auction_id: item.auction_id, inventory_id: item.inventory_id,
    lot_number: item.lot_number, product_name: item.product_name, description: item.description || null,
    upc: item.upc || null, condition_name: item.condition_name, category: item.category,
    retail_price: item.retail_price, is_pallet: Boolean(item.is_pallet), is_shippable: Boolean(item.is_shippable),
    is_transferrable: Boolean(item.is_transferrable), is_open: Boolean(item.is_open),
    quantity: item.quantity, building_id: item.building_id, image_url: item.image_url || null,
    shipping_weight: item.shipping_weight || null, estimated_shipping,
    ebay_comp_price: ebay_comp_price > 0 ? ebay_comp_price : null, ebay_comp_source: 'keyword',
    max_bid: result?.max_bid ?? null, local_max_bid: result?.local_max_bid ?? null,
    score: result?.score ?? null, status: 'active',
  };
}

function defaultLot(): Lot {
  return {
    id: 0, auction_id: 0, inventory_id: null, lot_number: '', product_name: '',
    description: null, upc: null, condition_name: null, category: null, retail_price: null,
    is_pallet: false, is_shippable: false, is_transferrable: false, is_open: true,
    quantity: 1, building_id: null, image_url: null, shipping_weight: null,
    expected_closing_utc: null, closed_date: null, winning_bid_amount: null,
    current_bid: null, ebay_comp_price: null, ebay_comp_url: null,
    ebay_comp_source: null, ebay_comp_updated_at: null,
    estimated_shipping: DEFAULT_SHIPPING, max_bid: null, local_max_bid: null, score: null,
    status: 'unscored', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

function mergeLots(incoming: Partial<Lot>[]) {
  lots.update(existing => {
    const map = new Map(existing.map(l => [l.id, l]));
    for (const partial of incoming) {
      if (!partial.id) continue;
      const ex = map.get(partial.id);
      if (ex) {
        const { status: _s, ...liveFields } = partial;
        map.set(partial.id, { ...ex, ...liveFields });
      } else {
        map.set(partial.id, { ...defaultLot(), ...partial } as Lot);
      }
    }
    return Array.from(map.values());
  });
}

export async function runFastPoll() {
  console.log('[poller] fast poll…');
  isPolling.set(true);
  try {
    const hits = await pollSearch();
    mergeLots(hits.map(scoreHit));
    for (const h of hits) {
      const aid = Number(h.auction_id);
      if (!auctionCache.has(aid)) auctionCache.set(aid, { lot_fee_override: null, buyers_premium_override: null });
    }
    const turbos = await pollTurbo();
    const turboLots: Partial<Lot>[] = [];
    for (const auction of turbos) {
      auctionCache.set(auction.id, { lot_fee_override: auction.lot_fee_override, buyers_premium_override: auction.buyers_premium_override });
      for (const item of auction.items ?? []) turboLots.push(scoreItem(item, auction));
    }
    mergeLots(turboLots);
    lastPollTime.set(new Date());
    console.log(`[poller] done — ${hits.length} search hits, ${turboLots.length} turbo lots`);
  } catch (err) {
    console.error('[poller] error:', err);
  } finally {
    isPolling.set(false);
  }
}

export async function runDetailPoll() {
  const pending = [...auctionCache.keys()].filter(id => !detailedAuctionIds.has(id));
  if (!pending.length) return;
  for (const auction_id of pending.slice(0, 5)) {
    const auction = await fetchAuctionDetail(auction_id);
    if (!auction) continue;
    auctionCache.set(auction_id, { lot_fee_override: auction.lot_fee_override, buyers_premium_override: auction.buyers_premium_override });
    detailedAuctionIds.add(auction_id);
    const detailLots = (auction.items ?? []).map(item => scoreItem(item, auction));
    mergeLots(detailLots);
    for (const lot of detailLots) {
      upsertLot(lot as Record<string, unknown>).catch(err => console.warn('[poller] upsert failed:', err));
    }
  }
}

export function startPoller() {
  if (fastPollTimer) return;
  console.log('[poller] starting…');
  runFastPoll();
  fastPollTimer   = setInterval(runFastPoll,   POLL_INTERVAL_FAST);
  detailPollTimer = setInterval(runDetailPoll, POLL_INTERVAL_DETAIL);
}

export function stopPoller() {
  if (fastPollTimer)   { clearInterval(fastPollTimer);   fastPollTimer = null; }
  if (detailPollTimer) { clearInterval(detailPollTimer); detailPollTimer = null; }
  isPolling.set(false);
  console.log('[poller] stopped');
}
