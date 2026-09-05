import { NextResponse } from "next/server";

// Cache market price in-memory for 30 seconds to prevent rate-limiting
let cachedPrice: number | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

async function fetchFromBinance(): Promise<number | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = parseFloat(data?.price);
    return isNaN(parsed) || parsed <= 0 ? null : parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchFromCoinbase(): Promise<number | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = parseFloat(data?.data?.amount);
    return isNaN(parsed) || parsed <= 0 ? null : parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  const now = Date.now();

  // Return cached price if still valid
  if (cachedPrice !== null && now - lastFetchTime < CACHE_TTL_MS) {
    return NextResponse.json({
      price: cachedPrice,
      source: "cached",
      timestamp: lastFetchTime,
    });
  }

  // 1. Primary: Binance public ticker
  const binancePrice = await fetchFromBinance();
  if (binancePrice !== null) {
    cachedPrice = binancePrice;
    lastFetchTime = now;
    return NextResponse.json({
      price: binancePrice,
      source: "binance",
      timestamp: now,
    });
  }

  // 2. Fallback: Coinbase public spot price
  const coinbasePrice = await fetchFromCoinbase();
  if (coinbasePrice !== null) {
    cachedPrice = coinbasePrice;
    lastFetchTime = now;
    return NextResponse.json({
      price: coinbasePrice,
      source: "coinbase",
      timestamp: now,
    });
  }

  // 3. Graceful degradation: return stale cache if available, else null
  if (cachedPrice !== null) {
    return NextResponse.json({
      price: cachedPrice,
      source: "stale_cache",
      timestamp: lastFetchTime,
    });
  }

  return NextResponse.json({
    price: null,
    source: "unavailable",
    error: "Live market reference price temporarily unavailable.",
  });
}
