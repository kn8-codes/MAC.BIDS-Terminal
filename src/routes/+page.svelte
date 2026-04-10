<svelte:head>
  <title>MAC.BID TERMINAL</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
    rel="stylesheet"
  />
</svelte:head>

<script lang="ts">
  import { onMount } from 'svelte';
  import { startPoller, stopPoller } from '$lib/utils/poller';
  import { lots, tickerItems } from '$lib/stores/lots';
  import {
    portfolio,
    activeBids,
    wonLots,
    listedLots,
    realizedProfit,
    totalBidExposure,
    liquidationAlerts,
    wonsThisMonth,
  } from '$lib/stores/portfolio';
  import type { Lot, PortfolioEntry } from '$lib/types';

  // ── CLOCK ─────────────────────────────────────────────────────
  let clock = $state(new Date());

  // ── SORT STATE ────────────────────────────────────────────────
  type SortKey = 'lot_number' | 'product_name' | 'category' | 'condition_name' | 'current_bid' | 'local_max_bid' | 'score' | 'expected_closing_utc';
  let sortKey = $state<SortKey>('expected_closing_utc');
  let sortDir = $state<1 | -1>(1);  // 1 = asc, -1 = desc

  function setSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 1 ? -1 : 1;
    } else {
      sortKey = key;
      sortDir = key === 'expected_closing_utc' ? 1 : -1;  // time asc, everything else desc by default
    }
  }

  function sortIcon(key: SortKey): string {
    if (sortKey !== key) return '↕';
    return sortDir === 1 ? '↑' : '↓';
  }

  // ── HELPERS ───────────────────────────────────────────────────
  const ageMs = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString();

  function fmt$(n: number | null): string {
    if (n === null) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function fmtScore(s: number): string {
    return (s * 100).toFixed(0) + '%';
  }

  function fmtCountdown(utc: number): string {
    const diff = utc - Math.floor(clock.getTime() / 1000);
    if (diff <= 0) return 'CLOSED';
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function isUrgent(utc: number): boolean {
    return utc - Math.floor(clock.getTime() / 1000) < 300;
  }

  function scoreColor(s: number): string {
    if (s >= 0.7) return 'var(--green)';
    if (s >= 0.5) return 'var(--yellow)';
    return 'var(--red)';
  }

  function clockStr(): string {
    return clock.toLocaleTimeString('en-US', { hour12: false });
  }

  // Minimal closed-lot stub for portfolio history entries
  function closedLot(
    id: number,
    lot_number: string,
    product_name: string,
    category: string,
    win_amount: number,
    days_ago: number,
  ): Lot {
    return {
      id, auction_id: 400, inventory_id: id * 10,
      lot_number, product_name,
      description: null, upc: null,
      condition_name: 'Used – Good', category,
      retail_price: null,
      is_pallet: false, is_shippable: true, is_transferrable: true, is_open: false,
      quantity: 1, building_id: 12, image_url: null, shipping_weight: null,
      expected_closing_utc: null,
      closed_date: ageMs(days_ago),
      winning_bid_amount: win_amount,
      current_bid: null, ebay_comp_price: null, ebay_comp_url: null,
      ebay_comp_source: null, ebay_comp_updated_at: null,
      estimated_shipping: 0, max_bid: null, local_max_bid: null, score: null,
      status: 'won',
      created_at: ageMs(days_ago), updated_at: ageMs(days_ago),
    };
  }

  // ── MOCK DATA ─────────────────────────────────────────────────
  // All times relative to now (unix seconds)
  const T = Math.floor(Date.now() / 1000);

  // 6 live auction lots — all open, status 'active'
  // Scores calculated via the scoring formula in src/lib/utils/scoring.ts
  const MOCK_LOTS: Lot[] = [
    {
      // Sony 65" BRAVIA XR OLED A95K — enormous room, early bidding
      // eBay comp $1,100 · local_max = (1100 - 3 - 50) / 1.15 = $910
      // score = (910 - 45) / 910 = 0.951
      id: 101, auction_id: 501, inventory_id: 10101,
      lot_number: '45821',
      product_name: 'Sony 65" BRAVIA XR A95K OLED TV',
      description: 'Open box. Minor scuff on rear panel, screen perfect.',
      upc: '027242919785', condition_name: 'Open Box',
      category: 'Electronics', retail_price: 2499.99,
      is_pallet: false, is_shippable: false, is_transferrable: true, is_open: true,
      quantity: 1, building_id: 12, image_url: null, shipping_weight: null,
      expected_closing_utc: T + 14 * 60,   // 14 min — urgent
      closed_date: null, winning_bid_amount: null,
      current_bid: 45, ebay_comp_price: 1100, ebay_comp_url: null,
      ebay_comp_source: 'upc', ebay_comp_updated_at: null,
      estimated_shipping: 0,
      max_bid: 786, local_max_bid: 910, score: 0.951,
      status: 'active',
      created_at: ageMs(0), updated_at: ageMs(0),
    },
    {
      // MacBook Air M2 — competitive item, bids climbing
      // eBay comp $720 · local_max = (720 - 3 - 50) / 1.15 = $580
      // score = (580 - 150) / 580 = 0.741
      id: 102, auction_id: 501, inventory_id: 10102,
      lot_number: '39042',
      product_name: 'Apple MacBook Air M2 8GB 256GB Midnight',
      description: 'Used. No charger included. Small nick on corner.',
      upc: '194253085157', condition_name: 'Used – Good',
      category: 'Computers', retail_price: 1099.99,
      is_pallet: false, is_shippable: true, is_transferrable: true, is_open: true,
      quantity: 1, building_id: 12, image_url: null, shipping_weight: 3.5,
      expected_closing_utc: T + 28 * 60,   // 28 min
      closed_date: null, winning_bid_amount: null,
      current_bid: 150, ebay_comp_price: 720, ebay_comp_url: null,
      ebay_comp_source: 'upc', ebay_comp_updated_at: null,
      estimated_shipping: 18,
      max_bid: 483, local_max_bid: 580, score: 0.741,
      status: 'active',
      created_at: ageMs(0), updated_at: ageMs(0),
    },
    {
      // DeWalt 20V 5-Tool Combo — heavy, local exit better
      // eBay comp $220 · local_max = (220 - 3 - 50) / 1.15 = $145
      // score = (145 - 35) / 145 = 0.759
      id: 103, auction_id: 501, inventory_id: 10103,
      lot_number: '51607',
      product_name: 'DeWalt 20V MAX 5-Tool Combo Kit DCK551M2',
      description: 'Used. All 5 tools present. 2 batteries, charger, bag.',
      upc: '885911417143', condition_name: 'Used – Good',
      category: 'Tools', retail_price: 449.99,
      is_pallet: false, is_shippable: true, is_transferrable: true, is_open: true,
      quantity: 1, building_id: 14, image_url: null, shipping_weight: 34,
      expected_closing_utc: T + 72 * 60,   // 1h 12m
      closed_date: null, winning_bid_amount: null,
      current_bid: 35, ebay_comp_price: 220, ebay_comp_url: null,
      ebay_comp_source: 'keyword', ebay_comp_updated_at: null,
      estimated_shipping: 32,
      max_bid: 93, local_max_bid: 145, score: 0.759,
      status: 'active',
      created_at: ageMs(0), updated_at: ageMs(0),
    },
    {
      // KitchenAid Artisan — local only, mid score
      // eBay comp $220 · local_max = (220 - 3 - 50) / 1.15 = $145
      // score = (145 - 55) / 145 = 0.621
      id: 104, auction_id: 502, inventory_id: 10104,
      lot_number: '28834',
      product_name: 'KitchenAid Artisan 5Qt Stand Mixer KSM150PS',
      description: 'Used. Bowl missing. All attachments present. Empire Red.',
      upc: '883049283486', condition_name: 'Used – Fair',
      category: 'Appliances', retail_price: 449.99,
      is_pallet: false, is_shippable: false, is_transferrable: true, is_open: true,
      quantity: 1, building_id: 14, image_url: null, shipping_weight: null,
      expected_closing_utc: T + 125 * 60,  // 2h 5m
      closed_date: null, winning_bid_amount: null,
      current_bid: 55, ebay_comp_price: 220, ebay_comp_url: null,
      ebay_comp_source: 'keyword', ebay_comp_updated_at: null,
      estimated_shipping: 0,
      max_bid: 145, local_max_bid: 145, score: 0.621,
      status: 'active',
      created_at: ageMs(0), updated_at: ageMs(0),
    },
    {
      // Samsung Odyssey G7 — shippable, decent comp
      // eBay comp $350 · local_max = (350 - 3 - 50) / 1.15 = $258
      // score = (258 - 90) / 258 = 0.651
      id: 105, auction_id: 502, inventory_id: 10105,
      lot_number: '44391',
      product_name: 'Samsung 27" Odyssey G7 4K 144Hz Curved Monitor',
      description: 'Open box. Stand included. Minor box damage only.',
      upc: '887276558578', condition_name: 'Open Box',
      category: 'Electronics', retail_price: 799.99,
      is_pallet: false, is_shippable: true, is_transferrable: true, is_open: true,
      quantity: 1, building_id: 14, image_url: null, shipping_weight: 22,
      expected_closing_utc: T + 220 * 60,  // 3h 40m
      closed_date: null, winning_bid_amount: null,
      current_bid: 90, ebay_comp_price: 350, ebay_comp_url: null,
      ebay_comp_source: 'upc', ebay_comp_updated_at: null,
      estimated_shipping: 35,
      max_bid: 188, local_max_bid: 258, score: 0.651,
      status: 'active',
      created_at: ageMs(0), updated_at: ageMs(0),
    },
    {
      // iPad Pro 11" M2 — hot item, bids already high, thin margin
      // eBay comp $480 · local_max = (480 - 3 - 50) / 1.15 = $371
      // score = (371 - 280) / 371 = 0.245
      id: 106, auction_id: 503, inventory_id: 10106,
      lot_number: '37215',
      product_name: 'Apple iPad Pro 11" M2 128GB WiFi Space Gray',
      description: 'Used. Screen protector applied. No Apple Pencil.',
      upc: '194253387540', condition_name: 'Used – Good',
      category: 'Computers', retail_price: 799.99,
      is_pallet: false, is_shippable: true, is_transferrable: true, is_open: true,
      quantity: 1, building_id: 15, image_url: null, shipping_weight: 2,
      expected_closing_utc: T + 315 * 60,  // 5h 15m
      closed_date: null, winning_bid_amount: null,
      current_bid: 280, ebay_comp_price: 480, ebay_comp_url: null,
      ebay_comp_source: 'upc', ebay_comp_updated_at: null,
      estimated_shipping: 14,
      max_bid: 305, local_max_bid: 371, score: 0.245,
      status: 'active',
      created_at: ageMs(0), updated_at: ageMs(0),
    },
  ];

  // 6 portfolio entries:
  //   2 active bids (lots 103, 105)
  //   2 won, unliquidated (one >14 days → triggers liquidationAlerts)
  //   1 listed on eBay
  //   1 sold with realized profit
  const MOCK_PORTFOLIO: PortfolioEntry[] = [
    {
      id: 'p-001', lot_id: 103, status: 'bid',
      bid_amount: 35, win_amount: null, sell_amount: null, net_profit: null,
      days_to_sell: null, exit_channel: 'local', notes: 'local pickup preferred',
      created_at: ageMs(0), updated_at: ageMs(0),
      lot: MOCK_LOTS.find(l => l.id === 103),
    },
    {
      id: 'p-002', lot_id: 105, status: 'bid',
      bid_amount: 90, win_amount: null, sell_amount: null, net_profit: null,
      days_to_sell: null, exit_channel: 'ebay', notes: null,
      created_at: ageMs(0), updated_at: ageMs(0),
      lot: MOCK_LOTS.find(l => l.id === 105),
    },
    {
      // Overdue: 17 days since won → appears in liquidationAlerts
      id: 'p-003', lot_id: 201, status: 'won',
      bid_amount: 175, win_amount: 175, sell_amount: null, net_profit: null,
      days_to_sell: null, exit_channel: 'ebay', notes: 'needs cleaning before listing',
      created_at: ageMs(17), updated_at: ageMs(17),
      lot: closedLot(201, '41832', 'Dyson V15 Detect Cordless Vacuum', 'Appliances', 175, 17),
    },
    {
      // Won 3 days ago — within 14-day window, no alert
      id: 'p-004', lot_id: 202, status: 'won',
      bid_amount: 45, win_amount: 45, sell_amount: null, net_profit: null,
      days_to_sell: null, exit_channel: 'ebay', notes: null,
      created_at: ageMs(3), updated_at: ageMs(3),
      lot: closedLot(202, '38904', 'Ninja Foodi 8Qt Pressure Cooker', 'Appliances', 45, 3),
    },
    {
      // Listed on eBay, waiting on buyer
      id: 'p-005', lot_id: 203, status: 'listed',
      bid_amount: 60, win_amount: 60, sell_amount: null, net_profit: null,
      days_to_sell: null, exit_channel: 'ebay', notes: 'listed at $289',
      created_at: ageMs(9), updated_at: ageMs(5),
      lot: closedLot(203, '33017', 'LG 55" OLED C3 4K Smart TV', 'Electronics', 60, 9),
    },
    {
      // Sold — contributes to realizedProfit
      id: 'p-006', lot_id: 204, status: 'sold',
      bid_amount: 55, win_amount: 55, sell_amount: 218, net_profit: 112,
      days_to_sell: 4, exit_channel: 'ebay', notes: null,
      created_at: ageMs(14), updated_at: ageMs(10),
      lot: closedLot(204, '29441', 'Sony WH-1000XM5 Headphones', 'Electronics', 55, 14),
    },
  ];

  onMount(() => {
    lots.set(MOCK_LOTS);            // seed with mock data — poller overwrites on first poll
    portfolio.set(MOCK_PORTFOLIO);

    const clockId = setInterval(() => { clock = new Date(); }, 1000);

    startPoller();  // 🟢 live MAC.BID data — overwrites mock lots when first poll completes

    return () => {
      clearInterval(clockId);
      stopPoller();
    };
  });

  // Feed: all open lots sorted by closing time (uses $lots directly
  // so all 6 show regardless of status — bid indicator comes from portfolio)
  function feedLots(all: Lot[]): Lot[] {
    return [...all]
      .filter(l => l.is_open)
      .sort((a, b) => {
        let av: string | number | null = a[sortKey] ?? null;
        let bv: string | number | null = b[sortKey] ?? null;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        if (typeof av === 'string' && typeof bv === 'string') {
          return av.localeCompare(bv) * sortDir;
        }
        return ((av as number) - (bv as number)) * sortDir;
      });
  }
</script>

<!-- ═══════════════════════════════════════════════════════════ -->
<!--  TERMINAL SHELL                                            -->
<!-- ═══════════════════════════════════════════════════════════ -->
<div class="terminal">

  <!-- ── ZONE 1: TICKER STRIP ────────────────────────────────── -->
  <div class="ticker-strip">
    <div class="ticker-label">MAC.BID</div>

    <div class="ticker-viewport">
      <!--
        Duplicate the list so the second copy is immediately behind the first.
        Animation slides -50% (one full copy width) then snaps back to 0 — seamless.
        Pause on hover so the user can read an item.
      -->
      <div class="ticker-track" style="animation-duration: {$tickerItems.length * 6}s">
        {#each [...$tickerItems, ...$tickerItems] as item, i (i)}
          {@const urgent = isUrgent(item.expected_closing_utc)}
          <a class="t-item" href="https://mac.bid/lot/{item.lot_id}" target="_blank" rel="noopener noreferrer">
            <span class="t-lot">{item.lot_number}</span>
            <span class="t-sep">·</span>
            <span class="t-name">{item.product_name.slice(0, 32)}</span>
            <span class="t-sep">·</span>
            <span class="t-bid">{fmt$(item.current_bid)}</span>
            <span class="t-arrow">→</span>
            <span class="t-max" style="color:{scoreColor(item.score)}">{fmt$(item.max_bid)}</span>
            <span class="t-score" style="color:{scoreColor(item.score)}">[{fmtScore(item.score)}]</span>
            <span class="t-time" class:t-urgent={urgent}>{fmtCountdown(item.expected_closing_utc)}</span>
            <span class="t-div">▸</span>
          </a>
        {/each}
      </div>
    </div>

    <div class="ticker-clock">{clockStr()}</div>
  </div>

  <!-- ── ZONES 2 + 3: MAIN AREA ───────────────────────────── -->
  <div class="main">

    <!-- ── ZONE 2: DEAL FEED ─────────────────────────────── -->
    <div class="deal-feed">
      <div class="zone-header">
        <span class="zone-title">DEAL FEED</span>
        <span class="zone-meta">
          {$lots.filter(l => l.is_open).length} LOTS · LIVE · SORTED BY CLOSE TIME
        </span>
      </div>

      <div class="feed-scroll">
        <table class="feed-table">
          <thead>
            <tr>
              <th class:th-sorted={sortKey === 'lot_number'} onclick={() => setSort('lot_number')}>LOT # <span class="sort-icon">{sortIcon('lot_number')}</span></th>
              <th class:th-sorted={sortKey === 'product_name'} onclick={() => setSort('product_name')}>PRODUCT <span class="sort-icon">{sortIcon('product_name')}</span></th>
              <th class:th-sorted={sortKey === 'category'} onclick={() => setSort('category')}>CAT <span class="sort-icon">{sortIcon('category')}</span></th>
              <th class:th-sorted={sortKey === 'condition_name'} onclick={() => setSort('condition_name')}>COND <span class="sort-icon">{sortIcon('condition_name')}</span></th>
              <th class="th-r" class:th-sorted={sortKey === 'current_bid'} onclick={() => setSort('current_bid')}>BID <span class="sort-icon">{sortIcon('current_bid')}</span></th>
              <th class="th-r" class:th-sorted={sortKey === 'local_max_bid'} onclick={() => setSort('local_max_bid')}>LOCAL MAX <span class="sort-icon">{sortIcon('local_max_bid')}</span></th>
              <th class:th-sorted={sortKey === 'score'} onclick={() => setSort('score')}>SCORE <span class="sort-icon">{sortIcon('score')}</span></th>
              <th class:th-sorted={sortKey === 'expected_closing_utc'} onclick={() => setSort('expected_closing_utc')}>CLOSES IN <span class="sort-icon">{sortIcon('expected_closing_utc')}</span></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each feedLots($lots) as lot (lot.id)}
              {@const urgent = isUrgent(lot.expected_closing_utc ?? 0)}
              {@const hasBid = $activeBids.some(e => e.lot_id === lot.id)}
              {@const bidEntry = $activeBids.find(e => e.lot_id === lot.id)}
              <tr class:urgent onclick={() => window.open(`https://mac.bid/lot/${lot.id}`, "_blank")} style="cursor: pointer;">
                <td class="td-lot">{lot.lot_number}</td>

                <td class="td-product">
                  <span class="product-name" title={lot.product_name}>
                    {lot.product_name}
                  </span>
                  {#if lot.description}
                    <span class="product-desc">{lot.description}</span>
                  {/if}
                </td>

                <td>
                  <span class="cat-badge">{lot.category ?? '—'}</span>
                </td>

                <td class="td-cond">{lot.condition_name ?? '—'}</td>

                <td class="td-num">
                  {#if hasBid}
                    <!-- show our bid amount vs current bid -->
                    <span class="our-bid">{fmt$(bidEntry?.bid_amount ?? null)}</span>
                    <span class="current-bid-label"> / {fmt$(lot.current_bid)}</span>
                  {:else}
                    {fmt$(lot.current_bid)}
                  {/if}
                </td>

                <td class="td-num td-max" style="color: {scoreColor(lot.score ?? 0)}">
                  {fmt$(lot.local_max_bid)}
                </td>

                <td class="td-score">
                  <div class="score-bar">
                    <div class="score-track">
                      <div
                        class="score-fill"
                        style="width: {Math.min((lot.score ?? 0) * 100, 100)}%; background: {scoreColor(lot.score ?? 0)}"
                      ></div>
                    </div>
                    <span class="score-pct" style="color: {scoreColor(lot.score ?? 0)}">
                      {fmtScore(lot.score ?? 0)}
                    </span>
                  </div>
                </td>

                <td class="td-countdown" class:urgent>
                  {fmtCountdown(lot.expected_closing_utc ?? 0)}
                </td>

                <td class="td-tag">
                  {#if hasBid}
                    <span class="tag-bid">BID</span>
                  {:else if !lot.is_shippable}
                    <span class="tag-local">LOCAL</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div><!-- /deal-feed -->

    <!-- ── ZONE 3: PORTFOLIO SIDEBAR ─────────────────────── -->
    <div class="sidebar">
      <div class="zone-header">
        <span class="zone-title">PORTFOLIO</span>
        {#if $liquidationAlerts.length > 0}
          <span class="alert-pill">⚠ {$liquidationAlerts.length}</span>
        {/if}
      </div>

      <div class="sidebar-scroll">

        <!-- ── P&L STAT GRID ────────────────────────────── -->
        <div class="stats-grid">
          <div class="stat">
            <div class="stat-label">EXPOSURE</div>
            <div class="stat-value">{fmt$($totalBidExposure)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">REALIZED P&L</div>
            <div class="stat-value green">{fmt$($realizedProfit)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">WON THIS MO</div>
            <div class="stat-value">{$wonsThisMonth}</div>
          </div>
          <div class="stat">
            <div class="stat-label">OVERDUE</div>
            <div class="stat-value" class:red={$liquidationAlerts.length > 0}>
              {$liquidationAlerts.length}
            </div>
          </div>
        </div>

        <!-- ── ACTIVE BIDS ───────────────────────────────── -->
        {#if $activeBids.length > 0}
          <div class="sidebar-section">
            <div class="section-header">ACTIVE BIDS ({$activeBids.length})</div>
            {#each $activeBids as entry (entry.id)}
              {@const lot = entry.lot}
              <div class="sidebar-row">
                <div class="sr-left">
                  <span class="sr-product">{lot?.product_name.slice(0, 22) ?? '—'}</span>
                  <span class="sr-meta">{lot?.lot_number} · {entry.exit_channel?.toUpperCase()}</span>
                </div>
                <div class="sr-right">
                  <span class="sr-value">{fmt$(entry.bid_amount)}</span>
                  <span class="sr-max">{fmt$(lot?.local_max_bid ?? null)} max</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- ── WON – UNLIQUIDATED ───────────────────────── -->
        {#if $wonLots.length > 0}
          <div class="sidebar-section">
            <div class="section-header">WON – PENDING SALE ({$wonLots.length})</div>
            {#each $wonLots as entry (entry.id)}
              {@const isAlert = $liquidationAlerts.some(a => a.id === entry.id)}
              {@const daysHeld = Math.floor((Date.now() - new Date(entry.created_at).getTime()) / 86_400_000)}
              <div class="sidebar-row" class:row-alert={isAlert}>
                <div class="sr-left">
                  <span class="sr-product">{entry.lot?.product_name.slice(0, 22) ?? '—'}</span>
                  <span class="sr-meta" class:meta-alert={isAlert}>
                    {daysHeld}d held · {entry.exit_channel?.toUpperCase() ?? '—'}
                  </span>
                </div>
                <div class="sr-right">
                  <span class="sr-value">{fmt$(entry.win_amount)}</span>
                  {#if isAlert}
                    <span class="badge-alert">OVERDUE</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <!-- ── LISTED ────────────────────────────────────── -->
        {#if $listedLots.length > 0}
          <div class="sidebar-section">
            <div class="section-header">LISTED ({$listedLots.length})</div>
            {#each $listedLots as entry (entry.id)}
              <div class="sidebar-row">
                <div class="sr-left">
                  <span class="sr-product">{entry.lot?.product_name.slice(0, 22) ?? '—'}</span>
                  <span class="sr-meta">{entry.exit_channel?.toUpperCase() ?? '—'}</span>
                </div>
                <div class="sr-right">
                  <span class="sr-value">{fmt$(entry.win_amount)}</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}

      </div><!-- /sidebar-scroll -->
    </div><!-- /sidebar -->

  </div><!-- /main -->
</div><!-- /terminal -->

<style>
  /* ── CSS VARIABLES ───────────────────────────────────────────── */
  .terminal {
    --bg:      #020817;
    --surface: #050f1f;
    --green:   #00FF41;
    --text:    #e2e8f0;
    --muted:   #64748b;
    --border:  rgba(0, 255, 65, 0.2);
    --red:     #ef4444;
    --yellow:  #fbbf24;
    --font-head: 'Bebas Neue', sans-serif;
    --font-mono: 'IBM Plex Mono', monospace;
  }

  /* ── RESET ───────────────────────────────────────────────────── */
  :global(html), :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    background: #020817;
  }

  /* ── TERMINAL SHELL ──────────────────────────────────────────── */
  .terminal {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    overflow: hidden;
  }

  /* ══════════════════════════════════════════════════════════════
     ZONE 1 — TICKER STRIP
  ══════════════════════════════════════════════════════════════ */
  .ticker-strip {
    flex-shrink: 0;
    height: 48px;
    display: flex;
    align-items: center;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    overflow: hidden;
  }

  .ticker-label {
    font-family: var(--font-head);
    font-size: 20px;
    letter-spacing: 3px;
    color: var(--green);
    padding: 0 18px;
    white-space: nowrap;
    border-right: 1px solid var(--border);
    line-height: 48px;
    flex-shrink: 0;
  }

  .ticker-viewport {
    flex: 1;
    overflow: hidden;
    /* mask edges for a fade-in/out dissolve effect */
    mask-image: linear-gradient(
      to right,
      transparent 0%,
      black 3%,
      black 97%,
      transparent 100%
    );
  }

  .ticker-track {
    display: flex;
    width: max-content;
    /* duration set inline per item count; default fallback */
    animation: ticker-scroll 36s linear infinite;
  }

  /* pause the scroll while the user is reading */
  .ticker-viewport:hover .ticker-track {
    animation-play-state: paused;
  }

  @keyframes ticker-scroll {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }

  .t-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 24px;
    font-size: 14px;
    white-space: nowrap;
    line-height: 48px;
  }

  .t-lot   { color: var(--muted); font-size: 12px; }
  a.t-item { text-decoration: none; color: inherit; transition: all 0.1s ease; }
  a.t-item:hover { font-weight: 600; letter-spacing: 0.02em; color: var(--text); }
  a.t-item:hover .t-lot { color: var(--green); }
  .t-sep   { color: rgba(100, 116, 139, 0.35); }
  .t-name  { color: var(--text); }
  .t-bid   { color: var(--muted); font-variant-numeric: tabular-nums; }
  .t-arrow { color: var(--muted); }
  .t-max   { font-weight: 600; font-variant-numeric: tabular-nums; }
  .t-score { font-size: 13px; font-weight: 600; }

  .t-time {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .t-time.t-urgent {
    color: var(--red);
    font-weight: 600;
    animation: blink 1s step-end infinite;
  }

  .t-div {
    color: rgba(0, 255, 65, 0.25);
    padding: 0 8px;
    font-size: 11px;
  }

  .ticker-clock {
    font-size: 15px;
    font-weight: 600;
    color: var(--green);
    padding: 0 18px;
    white-space: nowrap;
    border-left: 1px solid var(--border);
    letter-spacing: 1px;
    font-variant-numeric: tabular-nums;
    line-height: 48px;
    flex-shrink: 0;
  }

  /* ══════════════════════════════════════════════════════════════
     MAIN AREA
  ══════════════════════════════════════════════════════════════ */
  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* ── Shared: zone header ───────────────────────────────────── */
  .zone-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .zone-title {
    font-family: var(--font-head);
    font-size: 20px;
    letter-spacing: 3px;
    color: var(--green);
    line-height: 1;
  }

  .zone-meta {
    font-size: 9px;
    letter-spacing: 1px;
    color: var(--muted);
  }

  /* ══════════════════════════════════════════════════════════════
     ZONE 2 — DEAL FEED
  ══════════════════════════════════════════════════════════════ */
  .deal-feed {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-right: 1px solid var(--border);
  }

  .feed-scroll {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 255, 65, 0.2) transparent;
  }

  .feed-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  .feed-table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface);
    font-size: 9px;
    font-weight: 400;
    letter-spacing: 1.5px;
    color: var(--muted);
    text-align: left;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .feed-table thead .th-r { text-align: right; }
  .feed-table thead th { cursor: pointer; user-select: none; }
  .feed-table thead th:hover { color: var(--text); }
  .feed-table thead th.th-sorted { color: var(--green); }
  .sort-icon { opacity: 0.4; font-size: 8px; margin-left: 3px; }
  .th-sorted .sort-icon { opacity: 1; }

  .feed-table tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    vertical-align: top;
  }

  .feed-table tbody tr:hover td { background: rgba(0, 255, 65, 0.03); }
  .feed-table tbody tr.urgent td { background: rgba(239, 68, 68, 0.04); }

  /* column types */
  .td-lot  { color: var(--muted); font-size: 11px; white-space: nowrap; }
  .td-cond { color: var(--muted); font-size: 10px; white-space: nowrap; }

  .td-product { max-width: 0; width: 30%; }

  .product-name {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text);
    font-size: 12px;
  }

  .product-desc {
    display: block;
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
  }

  .cat-badge {
    display: inline-block;
    font-size: 9px;
    letter-spacing: 0.5px;
    color: var(--muted);
    background: rgba(0, 255, 65, 0.06);
    border: 1px solid rgba(0, 255, 65, 0.12);
    padding: 2px 6px;
    border-radius: 2px;
    white-space: nowrap;
  }

  .td-num {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .td-max { font-weight: 600; }

  .our-bid          { color: var(--green); font-weight: 600; }
  .current-bid-label { color: var(--muted); font-size: 10px; }

  .score-bar {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .score-track {
    width: 44px;
    height: 3px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    flex-shrink: 0;
  }

  .score-fill {
    height: 100%;
    border-radius: 2px;
  }

  .score-pct {
    font-size: 11px;
    font-weight: 600;
    min-width: 32px;
    font-variant-numeric: tabular-nums;
  }

  .td-countdown {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--text);
    white-space: nowrap;
    vertical-align: middle;
  }

  .td-countdown.urgent {
    color: var(--red);
    font-weight: 600;
    animation: blink 1s step-end infinite;
  }

  @keyframes blink { 50% { opacity: 0.35; } }

  .td-tag { white-space: nowrap; vertical-align: middle; }

  .tag-bid {
    font-size: 9px;
    letter-spacing: 1px;
    color: var(--green);
    background: rgba(0, 255, 65, 0.08);
    border: 1px solid rgba(0, 255, 65, 0.3);
    padding: 2px 6px;
    border-radius: 2px;
  }

  .tag-local {
    font-size: 9px;
    letter-spacing: 1px;
    color: var(--muted);
    background: rgba(100, 116, 139, 0.08);
    border: 1px solid rgba(100, 116, 139, 0.2);
    padding: 2px 6px;
    border-radius: 2px;
  }

  /* ══════════════════════════════════════════════════════════════
     ZONE 3 — PORTFOLIO SIDEBAR
  ══════════════════════════════════════════════════════════════ */
  .sidebar {
    width: 300px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .alert-pill {
    font-size: 9px;
    letter-spacing: 1px;
    color: var(--red);
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    padding: 2px 7px;
    border-radius: 2px;
  }

  .sidebar-scroll {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 255, 65, 0.15) transparent;
  }

  /* stats grid */
  .stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: rgba(0, 255, 65, 0.12);
    border-bottom: 1px solid var(--border);
  }

  .stat {
    background: var(--bg);
    padding: 10px 12px;
  }

  .stat-label {
    font-size: 8px;
    letter-spacing: 1.5px;
    color: var(--muted);
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .stat-value.green { color: var(--green); }
  .stat-value.red   { color: var(--red); }

  /* sections */
  .sidebar-section { border-bottom: 1px solid rgba(0, 255, 65, 0.08); }

  .section-header {
    font-size: 8px;
    letter-spacing: 2px;
    color: var(--muted);
    padding: 7px 12px 5px;
    background: var(--surface);
    border-bottom: 1px solid rgba(0, 255, 65, 0.08);
  }

  .sidebar-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.025);
  }

  .sidebar-row.row-alert { background: rgba(239, 68, 68, 0.05); }

  .sr-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .sr-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .sr-product {
    font-size: 11px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sr-meta {
    font-size: 9px;
    color: var(--muted);
    letter-spacing: 0.5px;
  }

  .sr-meta.meta-alert { color: var(--red); }

  .sr-value {
    font-size: 12px;
    font-weight: 600;
    color: var(--green);
    font-variant-numeric: tabular-nums;
  }

  .sr-max {
    font-size: 9px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .badge-alert {
    font-size: 8px;
    letter-spacing: 1px;
    color: var(--red);
    border: 1px solid rgba(239, 68, 68, 0.4);
    padding: 1px 4px;
    border-radius: 2px;
  }
</style>
