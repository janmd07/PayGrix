"use client";

import { useState, useEffect, useCallback } from "react";

export function useEthMarketPrice(enabled: boolean = true) {
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [source, setSource] = useState<string>("binance");

  const fetchPrice = useCallback(async () => {
    if (!enabled) return;
    try {
      setIsLoading(true);
      const res = await fetch("/api/swap/market-price");
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data.price === "number") {
        setMarketPrice(data.price);
        if (data.source) setSource(data.source);
      }
    } catch (err) {
      console.warn("Failed to fetch ETH market reference:", err);
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchPrice();
    // Refresh market price every 60 seconds
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  return { marketPrice, isLoading, source, refetch: fetchPrice };
}
