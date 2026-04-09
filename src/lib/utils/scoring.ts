// src/lib/utils/scoring.ts
// MAC.BID Terminal — Core scoring formula
// This is LAW for the first 90 days / 10 closed lots. No overrides.

export interface AuctionFees {
  lot_fee_override: number | null;
  buyers_premium_override: number | null;
}

export interface ScoringInput {
  current_bid: number;
  ebay_comp_price: number;
  estimated_shipping: number;
  is_shippable: boolean;
  auction: AuctionFees;
}

export interface ScoringResult {
  max_bid: number;         // eBay exit ceiling
  local_max_bid: number;   // Facebook / local pickup ceiling
  operative_max: number;   // higher of the two — use this as your bid ceiling
  profit_at_max: number;   // guaranteed profit if you win at exactly max bid
  score: number;           // (operative_max - current_bid) / operative_max
  has_room: boolean;       // true if current_bid is below operative_max
  margin_remaining: number; // dollars left before hitting ceiling
}

const EBAY_FVF        = 0.13;   // eBay final value fee 13%
const DEFAULT_LOT_FEE = 3;      // $3 per lot
const DEFAULT_BP      = 15;     // 15% buyer's premium
const PROFIT_FLOOR    = 50;     // $50 minimum net profit

export function score(input: ScoringInput): ScoringResult {
  const { current_bid, ebay_comp_price, estimated_shipping, is_shippable, auction } = input;

  const lot_fee = auction.lot_fee_override ?? DEFAULT_LOT_FEE;
  const bp_pct  = (auction.buyers_premium_override ?? DEFAULT_BP) / 100;

  // eBay exit ceiling — full fee stack
  const max_bid = (
    (ebay_comp_price * (1 - EBAY_FVF))
    - (is_shippable ? estimated_shipping : 0)
    - lot_fee
    - PROFIT_FLOOR
  ) / (1 + bp_pct);

  // Local exit ceiling — no eBay fees, no shipping
  const local_max_bid = (
    ebay_comp_price
    - lot_fee
    - PROFIT_FLOOR
  ) / (1 + bp_pct);

  const operative_max    = Math.max(max_bid, local_max_bid);
  const profit_at_max    = ebay_comp_price - operative_max - lot_fee - (is_shippable ? estimated_shipping : 0);
  const margin_remaining = operative_max - current_bid;
  const score_val        = operative_max > 0 ? margin_remaining / operative_max : 0;

  return {
    max_bid:          parseFloat(max_bid.toFixed(2)),
    local_max_bid:    parseFloat(local_max_bid.toFixed(2)),
    operative_max:    parseFloat(operative_max.toFixed(2)),
    profit_at_max:    parseFloat(profit_at_max.toFixed(2)),
    score:            parseFloat(score_val.toFixed(4)),
    has_room:         margin_remaining > 0,
    margin_remaining: parseFloat(margin_remaining.toFixed(2)),
  };
}

// Quick sanity check — run with: npx tsx src/lib/utils/scoring.ts
// Seed lot: retail $199.99, eBay comp ~$120, current bid $15, shipping $12
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = score({
    current_bid:        15,
    ebay_comp_price:    120,
    estimated_shipping: 12,
    is_shippable:       true,
    auction: {
      lot_fee_override:        null,
      buyers_premium_override: null,
    }
  });
  console.log('--- SCORING TEST ---');
  console.log(result);
  console.log(`Bid up to: $${result.operative_max}`);
  console.log(`Room left: $${result.margin_remaining}`);
  console.log(`Score:      ${(result.score * 100).toFixed(1)}%`);
}