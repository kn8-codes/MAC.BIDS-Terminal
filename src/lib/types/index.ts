// src/lib/types/index.ts
// MAC.BID Terminal — Shared TypeScript types
// Mirrors Supabase schema + MAC.BID API field names exactly

// ── API TYPES (raw from mac.bid) ─────────────────────────────

export interface MacBidAuction {
  id: number;
  auction_number: string;
  closing_date: string;
  pickup_date: string;
  abandon_date: string;
  location_id: number;
  location_name: string;
  building_id: number;
  lot_fee_override: number | null;
  buyers_premium_override: number | null;
  stagger_close_seconds: number;
  extension_window_seconds: number;
  allow_transfers: number;
  is_active: number;
  is_open: number;
  members_only: number;
  items?: MacBidItem[];
}

export interface MacBidItem {
  id: number;
  inventory_id: number;
  auction_id: number;
  lot_number: string;
  title: string;
  product_name: string;
  description: string;
  upc: string;
  retail_price: number;
  condition_name: string;
  category: string | null;
  is_pallet: number;
  is_shippable: number;
  is_transferrable: number;  // two r's — matches API
  is_partial: number;
  is_open: number;
  quantity: number;
  expected_close_date: string;
  closed_date: string | null;
  winning_bid_amount: number | null;
  total_bids: number;
  unique_bidders: number | null;
  image_url: string;
  images: MacBidImage[];
  shipping_weight: number;
  shipping_height: number;
  shipping_width: number;
  shipping_length: number;
  building_id: number;
  date_created: string;
}

export interface MacBidImage {
  id: number;
  inventory_id: number;
  image_url: string;
  date_created: string;
}

export interface MacBidSearchHit {
  id: string;               // "mac_lot_53399284" — string, not int
  lot_id: number;           // numeric lot ID
  auction_id: string;       // string here, int in item objects
  product_name: string;
  auction_number: string;
  auction_location: string;
  current_bid: number;      // ONLY place live bid is public
  retail_price: number;
  condition: string;        // note: 'condition' not 'condition_name'
  category: string;
  brand: string;
  us_state: string;
  expected_closing_utc: number;  // unix timestamp
  is_pallet: boolean;       // boolean here, int in item objects
  is_shippable: boolean;
  is_transferrable: boolean;
  is_open: number;
  total_bids: number;
  unique_bidders: number;
  upc: string;
  image_url: string;
  lot_number: string;
  box_size: string;
}

export interface MacBidBuilding {
  id: number;
  name: string;
  address: string;
  city_state: string;
  zip_code: string;
  state_abbr: string;
  code: string;
  latitude: number;
  longitude: number;
  sales_tax: number;
}

// ── SUPABASE / APP TYPES ─────────────────────────────────────

export type LotStatus = 'active' | 'bid' | 'won' | 'listed' | 'sold' | 'passed' | 'unscored';
export type ExitChannel = 'ebay' | 'facebook' | 'swappa' | 'local' | 'storefront' | 'other';
export type PortfolioStatus = 'bid' | 'won' | 'listed' | 'sold' | 'passed' | 'absorbed';
export type EbayCompSource = 'upc' | 'keyword' | null;

export interface Lot {
  id: number;
  auction_id: number;
  inventory_id: number | null;
  lot_number: string;
  product_name: string;
  description: string | null;
  upc: string | null;
  condition_name: string | null;
  category: string | null;
  retail_price: number | null;
  is_pallet: boolean;
  is_shippable: boolean;
  is_transferrable: boolean;
  is_open: boolean;
  quantity: number;
  building_id: number | null;
  image_url: string | null;
  shipping_weight: number | null;
  expected_closing_utc: number | null;
  closed_date: string | null;
  winning_bid_amount: number | null;

  // scored fields
  current_bid: number | null;
  ebay_comp_price: number | null;
  ebay_comp_url: string | null;
  ebay_comp_source: EbayCompSource;
  ebay_comp_updated_at: string | null;
  estimated_shipping: number;
  max_bid: number | null;
  local_max_bid: number | null;
  score: number | null;

  status: LotStatus;
  created_at: string;
  updated_at: string;

  // joined
  auction?: Auction;
}

export interface Auction {
  id: number;
  auction_number: string;
  lot_fee_override: number | null;
  buyers_premium_override: number | null;
  closing_date: string | null;
  location_id: number | null;
  building_id: number | null;
  allow_transfers: boolean;
  stagger_close_seconds: number;
  is_open: boolean;
}

export interface PortfolioEntry {
  id: string;
  lot_id: number;
  status: PortfolioStatus;
  bid_amount: number | null;
  win_amount: number | null;
  sell_amount: number | null;
  net_profit: number | null;
  days_to_sell: number | null;
  exit_channel: ExitChannel | null;
  notes: string | null;
  created_at: string;
  updated_at: string;

  // joined
  lot?: Lot;
}

export interface Settings {
  exposure_cap: number;
  profit_floor: number;
  membership_tier: 'free' | 'standard' | 'premium' | 'premium_plus' | 'vip';
  home_building_id: number | null;
  override_locked: boolean;
  lots_closed: number;
  override_eligible_date: string | null;
}

// ── TICKER ───────────────────────────────────────────────────

export interface TickerItem {
  lot_id: number;
  lot_number: string;
  product_name: string;
  current_bid: number;
  max_bid: number;
  score: number;
  expected_closing_utc: number;
  category: string | null;
  has_room: boolean;
}