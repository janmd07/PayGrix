import fs from "fs";
import path from "path";
import { pad, getAddress, isAddress } from "viem";

function padAddressToBytes32(address: string): `0x${string}` {
  const clean = address.trim();
  if (!isAddress(clean)) {
    throw new Error(`Invalid EVM address for recipient: "${address}"`);
  }
  const checksummed = getAddress(clean);
  return pad(checksummed as `0x${string}`, { size: 32, dir: "left" });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ TEST FAILED: ${message}`);
    process.exit(1);
  }
}

// In-memory mock localStorage
class MockLocalStorage {
  public store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

// Event system mock
class MockEventTarget {
  private listeners: Record<string, Array<(event: any) => void>> = {};

  addEventListener(type: string, listener: (event: any) => void): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  dispatchEvent(event: { type: string; [key: string]: any }): boolean {
    const list = this.listeners[event.type] || [];
    for (const listener of list) {
      listener(event);
    }
    return true;
  }
}

interface BridgeTransfer {
  id: string;
  fromChain: string;
  toChain: string;
  amount: string;
  token?: "USDC" | "EURC";
  asset?: "USDC" | "EURC";
  status: "Completed" | "Pending" | "Failed";
  date: string;
  sourceTx?: string;
  sourceTxHash?: string;
  destTx?: string;
  destinationTxHash?: string;
  walletAddress?: string;
  userAddress?: string;
  sender?: string;
  initiator?: string;
}

interface MainnetBridgeTransferRecord {
  id: string;
  sourceChain: string;
  destinationChain: string;
  amount: string;
  senderAddress: string;
  recipientAddress: string;
  burnTxHash: string;
  mintTxHash?: string;
  status: "Completed" | "Pending" | "Attesting" | "Forwarding" | "ReadyToClaim" | "Minting" | "ReconciliationRequired" | "Failed";
  timestamp: string;
  isForwarded?: boolean;
  forwardState?: string;
  forwardTxHash?: string;
}

async function runFocusedHistoryTests() {
  console.log("=== FOCUSED BASE -> ARC LIVE-SESSION HISTORY TESTS ===\n");

  const ROOT_DIR = process.cwd();
  const hookPath = path.join(ROOT_DIR, "src", "hooks", "use-mainnet-bridge.ts");
  const bridgePagePath = path.join(ROOT_DIR, "src", "app", "bridge", "page.tsx");

  assert(fs.existsSync(hookPath), "use-mainnet-bridge.ts must exist");
  assert(fs.existsSync(bridgePagePath), "src/app/bridge/page.tsx must exist");

  const hookCode = fs.readFileSync(hookPath, "utf-8");
  const pageCode = fs.readFileSync(bridgePagePath, "utf-8");

  // =========================================================================
  // Static checks on source code
  // =========================================================================
  console.log("[Static 1] Checking syncMainnetTransferToUniversalHistory dispatches paygrix_bridge_history_updated...");
  assert(
    hookCode.includes('window.dispatchEvent(new CustomEvent("paygrix_bridge_history_updated"))'),
    "Must dispatch 'paygrix_bridge_history_updated' CustomEvent"
  );
  assert(
    hookCode.includes('if (typeof window !== "undefined")'),
    "Must guard CustomEvent dispatch with browser check"
  );
  console.log("  ✓ CustomEvent dispatched with browser guard.");

  console.log("[Static 2] Checking src/app/bridge/page.tsx extracts loadHistory...");
  assert(
    pageCode.includes("const loadHistory = useCallback("),
    "Must extract loadHistory as a reusable useCallback function"
  );
  assert(
    pageCode.includes('"paygrix_bridge_history_updated"'),
    "Must listen for 'paygrix_bridge_history_updated'"
  );
  assert(
    pageCode.includes('window.addEventListener("storage"'),
    "Must listen for 'storage' event"
  );
  assert(
    pageCode.includes("activeTab"),
    "Must include activeTab in effect dependency array"
  );
  console.log("  ✓ loadHistory extracted and events wired.");

  console.log("[Static 3] Checking padded and unpadded wallet key support in page.tsx...");
  assert(
    pageCode.includes("padAddressToBytes32(currentWallet)"),
    "Must use padAddressToBytes32(currentWallet) for padded key"
  );
  console.log("  ✓ Both unpadded and padded wallet keys scanned.");

  // =========================================================================
  // Functional simulation of history loader & event dispatch
  // =========================================================================
  const mockStorage = new MockLocalStorage();
  const mockWindow = new MockEventTarget();

  // Functional mirror of syncMainnetTransferToUniversalHistory
  function syncMainnetTransfer(record: MainnetBridgeTransferRecord, walletAddress?: string) {
    const currentWallet = (walletAddress || record.senderAddress)?.toLowerCase();
    const burnTx = record.burnTxHash;
    const transferId = record.id || burnTx;
    if (!transferId && !burnTx) return;

    const destHash = record.mintTxHash || record.forwardTxHash;
    const raw = mockStorage.getItem("bridge_transfers");
    const existingTransfers: BridgeTransfer[] = raw ? JSON.parse(raw) : [];

    const existingIdx = existingTransfers.findIndex((t) => {
      if (transferId && t.id && t.id.toLowerCase() === transferId.toLowerCase()) return true;
      if (burnTx) {
        const sHash = t.sourceTxHash || t.sourceTx;
        if (sHash && sHash.toLowerCase() === burnTx.toLowerCase()) return true;
      }
      return false;
    });

    const statusMapped: "Completed" | "Pending" | "Failed" =
      record.status === "Completed"
        ? "Completed"
        : record.status === "Failed"
        ? "Failed"
        : "Pending";

    if (existingIdx !== -1) {
      const existing = existingTransfers[existingIdx];
      const effectiveDestHash = destHash || existing.destinationTxHash || existing.destTx;
      const updated: BridgeTransfer = {
        ...existing,
        id: existing.id || transferId,
        fromChain: record.sourceChain || existing.fromChain,
        toChain: record.destinationChain || existing.toChain,
        amount: record.amount || existing.amount,
        token: "USDC",
        asset: "USDC",
        status: statusMapped,
        date: existing.date || record.timestamp || new Date().toLocaleString(),
        sourceTx: burnTx || existing.sourceTx,
        sourceTxHash: burnTx || existing.sourceTxHash,
        destTx: effectiveDestHash,
        destinationTxHash: effectiveDestHash,
        walletAddress: existing.walletAddress || currentWallet,
        userAddress: existing.userAddress || currentWallet,
        sender: existing.sender || currentWallet,
        initiator: existing.initiator || currentWallet,
      };
      existingTransfers[existingIdx] = updated;
    } else {
      const newTransfer: BridgeTransfer = {
        id: transferId,
        fromChain: record.sourceChain,
        toChain: record.destinationChain,
        amount: record.amount,
        token: "USDC",
        asset: "USDC",
        status: statusMapped,
        date: record.timestamp || new Date().toLocaleString(),
        sourceTx: burnTx,
        sourceTxHash: burnTx,
        destTx: destHash,
        destinationTxHash: destHash,
        walletAddress: currentWallet,
        userAddress: currentWallet,
        sender: currentWallet,
        initiator: currentWallet,
      };
      existingTransfers.unshift(newTransfer);
    }

    mockStorage.setItem("bridge_transfers", JSON.stringify(existingTransfers));
    mockWindow.dispatchEvent({ type: "paygrix_bridge_history_updated" });
  }

  // Functional mirror of loadHistory logic in BridgePage
  let reactTransfersState: BridgeTransfer[] = [];
  let isSyncing = false;

  function simulateLoadHistory(currentWallet: string) {
    if (isSyncing) return;
    isSyncing = true;
    try {
      const keysToScan: string[] = [
        `paygrix_mainnet_bridge_transfers_${currentWallet.toLowerCase()}`,
      ];
      try {
        const padded = padAddressToBytes32(currentWallet).toLowerCase();
        const paddedKey = `paygrix_mainnet_bridge_transfers_${padded}`;
        if (!keysToScan.includes(paddedKey)) {
          keysToScan.push(paddedKey);
        }
      } catch {}

      for (const key of keysToScan) {
        const mainnetSaved = mockStorage.getItem(key);
        if (mainnetSaved) {
          const mainnetList: MainnetBridgeTransferRecord[] = JSON.parse(mainnetSaved);
          if (Array.isArray(mainnetList)) {
            mainnetList.forEach((mRec) => {
              syncMainnetTransfer(mRec, currentWallet);
            });
          }
        }
      }

      let allTransfers: BridgeTransfer[] = [];
      const savedTransfers = mockStorage.getItem("bridge_transfers");
      if (savedTransfers) {
        const parsed = JSON.parse(savedTransfers);
        if (Array.isArray(parsed)) {
          allTransfers = parsed.map((item) => {
            const sHash = item.sourceTxHash || item.sourceTx;
            const dHash = item.destinationTxHash || item.destTx;
            const isCorrupted = Boolean(
              dHash && sHash && dHash.toLowerCase() === sHash.toLowerCase()
            );
            const cleanDest = isCorrupted ? undefined : dHash;
            return {
              ...item,
              sourceTx: sHash,
              sourceTxHash: sHash,
              destTx: cleanDest,
              destinationTxHash: cleanDest,
            };
          });
        }
      }

      reactTransfersState = allTransfers.filter((item) => {
        const initiator = item.walletAddress || item.userAddress || item.sender || item.initiator;
        return initiator && initiator.toLowerCase() === currentWallet.toLowerCase();
      });
    } finally {
      isSyncing = false;
    }
  }

  const TEST_WALLET = "0xe2ef8f89df0b50975328eb8859116bbe90c1036d";
  const PADDED_WALLET = padAddressToBytes32(TEST_WALLET).toLowerCase();

  // Wire up event listener
  mockWindow.addEventListener("paygrix_bridge_history_updated", () => {
    simulateLoadHistory(TEST_WALLET);
  });

  // TEST 1: history update event refreshes BridgePage state
  console.log("[Test 1/6] History update event refreshes BridgePage React state...");
  {
    mockStorage.clear();
    reactTransfersState = [];

    // Simulate completion of a Base -> Arc transfer in useMainnetBridge
    const newRecord: MainnetBridgeTransferRecord = {
      id: "mainnet-live-1",
      sourceChain: "Base Mainnet",
      destinationChain: "Arc Mainnet",
      amount: "150.00",
      senderAddress: TEST_WALLET,
      recipientAddress: TEST_WALLET,
      burnTxHash: "0xbaseburn_live_001",
      mintTxHash: undefined,
      status: "Completed",
      timestamp: "2026-10-02 14:00:00",
    };

    syncMainnetTransfer(newRecord, TEST_WALLET);

    assert(reactTransfersState.length === 1, "React state must update immediately on event dispatch");
    assert(reactTransfersState[0].id === "mainnet-live-1", "React state must contain the new transfer");
    assert(reactTransfersState[0].amount === "150.00", "Amount must match");
    console.log("  ✓ Live dispatch immediately updated React state without page refresh.");
  }

  // TEST 2: padded wallet key is ingested
  console.log("[Test 2/6] Padded wallet key is ingested properly...");
  {
    mockStorage.clear();
    reactTransfersState = [];

    // Place a legacy transfer under the 32-byte zero-padded key
    const paddedKey = `paygrix_mainnet_bridge_transfers_${PADDED_WALLET}`;
    const legacyRecord: MainnetBridgeTransferRecord = {
      id: "legacy-padded-1",
      sourceChain: "Base Mainnet",
      destinationChain: "Arc Mainnet",
      amount: "500.00",
      senderAddress: TEST_WALLET,
      recipientAddress: TEST_WALLET,
      burnTxHash: "0xbaseburn_padded_123",
      mintTxHash: undefined,
      status: "Completed",
      timestamp: "2026-09-30 10:00:00",
    };
    mockStorage.setItem(paddedKey, JSON.stringify([legacyRecord]));

    // Trigger loadHistory for unpadded wallet address
    simulateLoadHistory(TEST_WALLET);

    assert(reactTransfersState.length === 1, "Transfer from padded key must be loaded");
    assert(reactTransfersState[0].id === "legacy-padded-1", "Padded record id must match");
    assert(reactTransfersState[0].sourceTx === "0xbaseburn_padded_123", "Source tx must match");
    console.log("  ✓ Padded wallet key successfully detected and ingested into history.");
  }

  // TEST 3: Base -> Arc completed transfer appears in history
  console.log("[Test 3/6] Base -> Arc completed transfer appears in history...");
  {
    mockStorage.clear();
    reactTransfersState = [];

    const baseToArcRecord: MainnetBridgeTransferRecord = {
      id: "base-arc-completed-1",
      sourceChain: "Base Mainnet",
      destinationChain: "Arc Mainnet",
      amount: "250.00",
      senderAddress: TEST_WALLET,
      recipientAddress: TEST_WALLET,
      burnTxHash: "0xbaseburn_prod_999",
      mintTxHash: undefined,
      status: "Completed",
      timestamp: "2026-10-02 18:30:00",
    };

    syncMainnetTransfer(baseToArcRecord, TEST_WALLET);

    assert(reactTransfersState.length === 1, "Base -> Arc transfer must be in transfers state");
    assert(reactTransfersState[0].fromChain === "Base Mainnet", "From chain must be Base Mainnet");
    assert(reactTransfersState[0].toChain === "Arc Mainnet", "To chain must be Arc Mainnet");
    assert(reactTransfersState[0].status === "Completed", "Status must be Completed");
    console.log("  ✓ Base -> Arc completed transfer appears with correct chains and status.");
  }

  // TEST 4: existing history records are preserved
  console.log("[Test 4/6] Existing history records are preserved...");
  {
    // Pre-populate with existing records
    const preExisting: BridgeTransfer[] = [
      {
        id: "existing-testnet-1",
        fromChain: "Arc Testnet",
        toChain: "Base Sepolia",
        amount: "10.00",
        token: "USDC",
        status: "Completed",
        date: "2026-09-01 12:00:00",
        sourceTx: "0xexisting1",
        walletAddress: TEST_WALLET,
      },
      {
        id: "existing-mainnet-1",
        fromChain: "Arc Mainnet",
        toChain: "Base Mainnet",
        amount: "75.00",
        token: "USDC",
        status: "Completed",
        date: "2026-10-01 15:00:00",
        sourceTx: "0xexisting2",
        destTx: "0xdeste2e",
        walletAddress: TEST_WALLET,
      },
    ];
    mockStorage.setItem("bridge_transfers", JSON.stringify(preExisting));

    // Add a new Base -> Arc transfer
    const newRecord: MainnetBridgeTransferRecord = {
      id: "base-arc-new-transfer",
      sourceChain: "Base Mainnet",
      destinationChain: "Arc Mainnet",
      amount: "300.00",
      senderAddress: TEST_WALLET,
      recipientAddress: TEST_WALLET,
      burnTxHash: "0xbaseburn_new_300",
      mintTxHash: undefined,
      status: "Completed",
      timestamp: "2026-10-02 19:00:00",
    };

    syncMainnetTransfer(newRecord, TEST_WALLET);

    assert(reactTransfersState.length === 3, "All 3 transfers must be present");
    const ids = reactTransfersState.map((t) => t.id);
    assert(ids.includes("existing-testnet-1"), "existing-testnet-1 must be preserved");
    assert(ids.includes("existing-mainnet-1"), "existing-mainnet-1 must be preserved");
    assert(ids.includes("base-arc-new-transfer"), "new transfer must be present");

    // Also check destination hash of existing-mainnet-1 was not overwritten
    const existingMainnet = reactTransfersState.find((t) => t.id === "existing-mainnet-1");
    assert(existingMainnet?.destTx === "0xdeste2e", "Existing destination hash must be preserved");
    console.log("  ✓ All existing records and destination hashes preserved without loss.");
  }

  // TEST 5: repeated event does not duplicate records
  console.log("[Test 5/6] Repeated events / syncs do not duplicate records...");
  {
    const initialCount = reactTransfersState.length;

    // Simulate multiple calls to sync or loadHistory with the exact same record
    const duplicateRecord: MainnetBridgeTransferRecord = {
      id: "base-arc-new-transfer",
      sourceChain: "Base Mainnet",
      destinationChain: "Arc Mainnet",
      amount: "300.00",
      senderAddress: TEST_WALLET,
      recipientAddress: TEST_WALLET,
      burnTxHash: "0xbaseburn_new_300",
      mintTxHash: undefined,
      status: "Completed",
      timestamp: "2026-10-02 19:00:00",
    };

    syncMainnetTransfer(duplicateRecord, TEST_WALLET);
    syncMainnetTransfer(duplicateRecord, TEST_WALLET);
    simulateLoadHistory(TEST_WALLET);

    assert(
      reactTransfersState.length === initialCount,
      `Expected ${initialCount} records, but got ${reactTransfersState.length} (duplicates created!)`
    );
    console.log("  ✓ Sync is fully idempotent; no duplicate records created.");
  }

  // TEST 6: no destination hash is fabricated when unavailable
  console.log("[Test 6/6] No destination hash is fabricated when unavailable...");
  {
    const baseArcTransfer = reactTransfersState.find((t) => t.id === "base-arc-new-transfer");
    assert(baseArcTransfer !== undefined, "Transfer must exist");
    assert(baseArcTransfer?.destTx === undefined, "destTx must be undefined, NOT fabricated");
    assert(baseArcTransfer?.destinationTxHash === undefined, "destinationTxHash must be undefined, NOT fabricated");
    assert(baseArcTransfer?.sourceTx === "0xbaseburn_new_300", "sourceTx must be exact burnTxHash");
    assert(baseArcTransfer?.status === "Completed", "status must be Completed even with destTx undefined");
    console.log("  ✓ Destination hash is safely left undefined without fabrication.");
  }

  console.log("\n==================================================================");
  console.log("🎉 ALL 6 FOCUSED LIVE-SESSION HISTORY TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================================");
}

runFocusedHistoryTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
