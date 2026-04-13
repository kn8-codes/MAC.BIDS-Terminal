// src/lib/utils/ebay.ts
// MAC.BID Terminal — eBay Finding API (completed/sold items)
// Uses client credentials token — no user auth required.

const FINDING_API_URL = 'https://svcs.ebay.com/services/search/FindingService/v1';
const APP_ID = import.meta.env.VITE_EBAY_APP_ID ?? '';

export interface EbayComp {
  title: string;
  sold_price: number;
  sold_date: string;
  url: string;
  condition: string;
}

export interface CompResult {
  comps: EbayComp[];
  median: number;
  avg: number;
  low: number;
  high: number;
  count: number;
}

/**
 * Fetch completed (sold) eBay listings for a search term.
 * Returns price stats used by the scoring formula.
 */
export async function getEbayComps(
  searchTerm: string,
  limit = 10
): Promise<CompResult> {
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': APP_ID,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': '',
    'keywords': searchTerm,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'itemFilter(1).name': 'ListingType',
    'itemFilter(1).value': 'AuctionWithBIN',
    'itemFilter(2).name': 'ListingType(1)',
    'itemFilter(2).value': 'FixedPrice',
    'sortOrder': 'EndTimeSoonest',
    'paginationInput.entriesPerPage': String(limit),
  });

  const res = await fetch(`${FINDING_API_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`eBay API error: ${res.status}`);

  const data = await res.json();
  const items =
    data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];

  const comps: EbayComp[] = items.map((item: any) => ({
    title: item.title?.[0] ?? '',
    sold_price: parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__'] ?? '0'),
    sold_date: item.listingInfo?.[0]?.endTime?.[0] ?? '',
    url: item.viewItemURL?.[0] ?? '',
    condition: item.condition?.[0]?.conditionDisplayName?.[0] ?? 'Unknown',
  }));

  const prices = comps.map((c) => c.sold_price).filter((p) => p > 0).sort((a, b) => a - b);

  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
  const median = prices.length
    ? prices.length % 2 === 0
      ? (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : prices[Math.floor(prices.length / 2)]
    : 0;

  return {
    comps,
    median: parseFloat(median.toFixed(2)),
    avg: parseFloat(avg.toFixed(2)),
    low: prices[0] ?? 0,
    high: prices[prices.length - 1] ?? 0,
    count: prices.length,
  };
}
