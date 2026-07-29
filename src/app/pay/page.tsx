"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  QrCode, 
  ScanLine, 
  Send, 
  Copy, 
  Check, 
  ExternalLink, 
  AlertTriangle, 
  Search, 
  Clock, 
  Download, 
  Share2, 
  RefreshCw,
  Wallet,
  Sparkles
} from "lucide-react";
import { 
  erc20Abi, 
  parseUnits, 
  formatUnits, 
  isAddress, 
  type Address 
} from "viem";
import { 
  useAccount, 
  useWriteContract, 
  usePublicClient,
  useReadContract 
} from "wagmi";

import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useArcWallet } from "@/components/wallet/use-arc-wallet";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { QRCodeCanvas } from "qrcode.react";

// Hardcoded Arc Testnet USDC configuration
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as Address;
const CHAIN_ID = 5042002;
const EXPLORER_URL = "https://testnet.arcscan.app";

type PaymentRecord = {
  id?: string;
  request_id?: string | null;
  sender_address: string;
  recipient_address: string;
  recipient_name?: string | null;
  amount: number;
  token_symbol: string;
  token_address: string;
  chain_id: number;
  network: string;
  tx_hash: string;
  note?: string | null;
  source_type: string;
  status: string;
  created_at: string;
};

type ParsedPaymentData = {
  requestId: string;
  recipient: string;
  recipientName: string;
  amount: string;
  note: string;
  expiresAt: string | null;
  sourceType: "manual" | "qr" | "payment_link";
};

function PayPageContent() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"send" | "receive" | "scan" | "history">("send");
  
  // Wallet state
  const { isConnected, address } = useAccount();
  const { isArcTestnet } = useArcWallet();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  
  // Balance state
  const { data: usdcBalanceRaw, refetch: refetchBalance, isLoading: isBalanceLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    }
  });

  const usdcBalance = usdcBalanceRaw !== undefined 
    ? Number(formatUnits(usdcBalanceRaw, 6)) 
    : 0;

  // Send Form State
  const [recipient, setRecipient] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [requestId, setRequestId] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [paymentSource, setPaymentSource] = useState<"manual" | "qr" | "payment_link">("manual");
  
  // Warnings / Detections
  const [isContractRecipient, setIsContractRecipient] = useState(false);
  const [isSelfTransfer, setIsSelfTransfer] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  
  // Review Modal State
  const [reviewOpen, setReviewOpen] = useState(false);
  const [isDuplicateRequest, setIsDuplicateRequest] = useState(false);
  const [bypassDuplicateWarning, setBypassDuplicateWarning] = useState(false);
  
  // Transaction lifecycle
  const { writeContractAsync } = useWriteContract();
  const [txStatus, setTxStatus] = useState<"idle" | "broadcasting" | "confirming" | "success" | "failed">("idle");
  const [txHash, setTxHash] = useState("");
  const [txError, setTxError] = useState<string | null>(null);
  
  // Receive Form State
  const [recvName, setRecvName] = useState("");
  const [recvAmount, setRecvAmount] = useState("");
  const [recvNote, setRecvNote] = useState("");
  const [recvExpiry, setRecvExpiry] = useState("never"); // never, 15m, 1h, 24h
  const [generatedLink, setGeneratedLink] = useState("");
  const [generatedJson, setGeneratedJson] = useState("");
  const [recvRequestId, setRecvRequestId] = useState("");
  const [recvExpiresAt, setRecvExpiresAt] = useState<string | null>(null);
  
  // Copy state helpers
  const [copiedText, setCopiedText] = useState("");

  // Scan State
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html5QrcodeCtorRef = useRef<any>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [fileScanSuccess, setFileScanSuccess] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html5QrCodeRef = useRef<any>(null);
  
  // History State
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "manual" | "qr" | "payment_link">("all");
  const [historySearch, setHistorySearch] = useState("");

  const searchParams = useSearchParams();

  // Load dynamically html5-qrcode
  useEffect(() => {
    let cancelled = false;
    const loadScanner = async () => {
      if (typeof window === "undefined") return;
      try {
        const qrModule = await import("html5-qrcode");
        if (!cancelled) {
          html5QrcodeCtorRef.current = qrModule.Html5Qrcode;
        }
      } catch (err) {
        console.error("Dynamic import error for html5-qrcode:", err);
      }
    };
    loadScanner();
    setMounted(true);
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch history list
  const loadHistory = useCallback(async () => {
    if (!address) {
      setHistory([]);
      return;
    }
    setIsHistoryLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from("pay_history")
          .select("*")
          .or(`sender_address.eq.${address.toLowerCase()},recipient_address.eq.${address.toLowerCase()}`)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setHistory(data || []);
      } else {
        const localKey = `paygrid_history_${address.toLowerCase()}`;
        const localData = localStorage.getItem(localKey);
        if (localData) {
          setHistory(JSON.parse(localData));
        } else {
          setHistory([]);
        }
      }
    } catch (err) {
      console.error("Error loading payment history:", err);
      // Fallback
      const localKey = `paygrid_history_${address.toLowerCase()}`;
      const localData = localStorage.getItem(localKey);
      if (localData) {
        setHistory(JSON.parse(localData));
      }
    } finally {
      setIsHistoryLoading(false);
    }
  }, [address]);

  // Load history on mount or when account changes
  useEffect(() => {
    if (mounted && address) {
      loadHistory();
    }
  }, [mounted, address, loadHistory]);

  // Parse URL payment link params
  useEffect(() => {
    if (!mounted || !searchParams) return;
    
    const recipientParam = searchParams.get("recipient");
    const amountParam = searchParams.get("amount");
    const noteParam = searchParams.get("note");
    const nameParam = searchParams.get("name");
    const reqIdParam = searchParams.get("requestId");
    const chainParam = searchParams.get("chainId");
    const expiresParam = searchParams.get("expiresAt");
    const tokenParam = searchParams.get("token");

    if (recipientParam) {
      try {
        setUrlError(null);
        if (!isAddress(recipientParam)) {
          throw new Error("Invalid recipient address specified in link.");
        }
        if (chainParam && Number(chainParam) !== CHAIN_ID) {
          throw new Error("This payment request is for a different blockchain network.");
        }
        if (tokenParam && tokenParam !== "USDC") {
          throw new Error("Only USDC payments are supported in PayGrix QR.");
        }
        if (expiresParam) {
          const expDate = new Date(expiresParam);
          if (!isNaN(expDate.getTime()) && expDate.getTime() < Date.now()) {
            throw new Error("This payment link request has expired.");
          }
        }

        setRecipient(recipientParam);
        if (amountParam) setAmount(amountParam);
        if (noteParam) setPaymentNote(decodeURIComponent(noteParam).substring(0, 100));
        if (nameParam) setRecipientName(decodeURIComponent(nameParam));
        if (reqIdParam) setRequestId(reqIdParam);
        if (expiresParam) setExpiresAt(expiresParam);
        setPaymentSource("payment_link");
        
        // Auto open review screen
        setReviewOpen(true);
      } catch (err) {
        console.error("URL Params load error:", err);
        setUrlError((err as Error).message || "Failed to parse payment link.");
      }
    }
  }, [mounted, searchParams]);

  // Detect Smart Contract or Self-transfer
  useEffect(() => {
    if (!recipient) {
      setIsContractRecipient(false);
      setIsSelfTransfer(false);
      return;
    }
    
    if (isAddress(recipient)) {
      setIsSelfTransfer(address?.toLowerCase() === recipient.toLowerCase());
      
      const checkBytecode = async () => {
        if (publicClient) {
          try {
            const bytecode = await publicClient.getBytecode({ address: recipient as Address });
            setIsContractRecipient(!!bytecode && bytecode !== "0x");
          } catch {
            setIsContractRecipient(false);
          }
        }
      };
      checkBytecode();
    } else {
      setIsContractRecipient(false);
      setIsSelfTransfer(false);
    }
  }, [recipient, address, publicClient]);

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(""), 2000);
  };

  // QR link generator for receive tab
  const handleGenerateQR = () => {
    if (!address) return;
    
    const reqId = `pay_${Math.random().toString(36).substring(2, 11)}_${Date.now().toString(36)}`;
    setRecvRequestId(reqId);
    
    let expISO: string | null = null;
    if (recvExpiry !== "never") {
      const now = new Date();
      if (recvExpiry === "15m") now.setMinutes(now.getMinutes() + 15);
      else if (recvExpiry === "1h") now.setHours(now.getHours() + 1);
      else if (recvExpiry === "24h") now.setHours(now.getHours() + 24);
      expISO = now.toISOString();
    }
    setRecvExpiresAt(expISO);

    // Build absolute path link
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const path = `/pay?requestId=${reqId}` +
      `&recipient=${address}` +
      (recvName ? `&name=${encodeURIComponent(recvName)}` : "") +
      (recvAmount ? `&amount=${recvAmount}` : "") +
      `&token=USDC` +
      `&chainId=${CHAIN_ID}` +
      (recvNote ? `&note=${encodeURIComponent(recvNote)}` : "") +
      (expISO ? `&expiresAt=${expISO}` : "");
      
    const fullUrl = `${origin}${path}`;
    setGeneratedLink(fullUrl);

    // Build versioned JSON payload
    const jsonPayload = {
      type: "paygrid-payment",
      version: 1,
      app: "PayGrix",
      appVersion: "1.0.0",
      requestId: reqId,
      network: {
        name: "Arc Testnet",
        chainId: CHAIN_ID
      },
      token: {
        symbol: "USDC",
        address: USDC_ADDRESS,
        decimals: 6
      },
      recipient: {
        address: address,
        name: recvName || undefined
      },
      amount: recvAmount || undefined,
      note: recvNote || undefined,
      createdAt: new Date().toISOString(),
      expiresAt: expISO
    };
    setGeneratedJson(JSON.stringify(jsonPayload, null, 2));
  };

  // Download QR Canvas PNG
  const handleDownloadQR = () => {
    const canvas = document.getElementById("paygrid-qr-canvas") as HTMLCanvasElement;
    if (canvas) {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `paygrid-payment-${recvRequestId || "request"}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Share using native Web Share API
  const handleShareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "PayGrix USDC Payment Request",
          text: `Pay ${recvAmount ? `${recvAmount} USDC` : "USDC"} to ${recvName || address}`,
          url: generatedLink
        });
      } catch (err) {
        console.warn("Share failed:", err);
      }
    } else {
      handleCopy(generatedLink, "link");
    }
  };

  // Camera start/stop logic
  const startCamera = async () => {
    if (!html5QrcodeCtorRef.current) return;
    if (typeof window === "undefined") return;
    
    const container = document.getElementById("scanner-feed-container");
    if (!container) {
      setScannerError("Camera container element not found in DOM.");
      return;
    }

    try {
      setScannerError(null);
      setScannerActive(true);
      setFileScanSuccess(false);

      // Clean up any existing scanner instance before creating a new one
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
          }
          await html5QrCodeRef.current.clear();
        } catch (e) {
          console.warn("Cleanup of previous scanner instance failed:", e);
        }
        html5QrCodeRef.current = null;
      }

      const html5QrCode = new html5QrcodeCtorRef.current("scanner-feed-container");
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (width: number, height: number) => {
            const size = Math.min(width, height) * 0.75;
            return { width: size, height: size };
          }
        },
        (decodedText: string) => {
          handleQrDecoded(decodedText);
          stopCamera();
        },
        () => {
          // ignore stream scanning mismatch logs
        }
      );
    } catch (err) {
      console.error("Camera permissions/start error:", err);
      setScannerError((err as Error).message || "Failed to initialize camera. Verify permissions.");
      setScannerActive(false);
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (e) {
        console.error("Camera stop cleanup error:", e);
      }
      html5QrCodeRef.current = null;
    }
    setScannerActive(false);
  };

  // Camera Tab and component unmount lifecycle
  useEffect(() => {
    if (activeTab !== "scan") {
      stopCamera();
    }
    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(console.error);
      }
    };
  }, [activeTab]);

  // QR Decoded logic (both camera and file scan)
  const handleQrDecoded = (text: string) => {
    try {
      setScannerError(null);
      let parsed: ParsedPaymentData | null = null;

      if (text.startsWith("{")) {
        const json = JSON.parse(text);
        if (json.type !== "paygrid-payment") {
          throw new Error("Invalid payload type. Must be 'paygrid-payment'.");
        }
        if (json.version !== 1) {
          throw new Error("Unsupported payment version payload.");
        }
        
        const chainIdVal = json.network?.chainId || json.chainId;
        if (chainIdVal && Number(chainIdVal) !== CHAIN_ID) {
          throw new Error("This QR request is for a different blockchain network.");
        }

        const tokenAddressVal = json.token?.address || json.tokenAddress;
        if (tokenAddressVal && tokenAddressVal.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
          throw new Error("Unsupported token address. Only official USDC is supported.");
        }

        parsed = {
          requestId: json.requestId || "",
          recipient: json.recipient?.address || json.recipient || "",
          recipientName: json.recipient?.name || json.name || "",
          amount: json.amount || "",
          note: json.note || "",
          expiresAt: json.expiresAt || null,
          sourceType: "qr"
        };
      } else if (text.includes("/pay?") || text.includes("pay?")) {
        const urlString = text.startsWith("http") ? text : `https://paygrid.io${text.startsWith("/") ? "" : "/"}${text}`;
        const url = new URL(urlString);
        
        const chainIdVal = url.searchParams.get("chainId");
        if (chainIdVal && Number(chainIdVal) !== CHAIN_ID) {
          throw new Error("This request link is for a different blockchain network.");
        }

        const tokenVal = url.searchParams.get("token");
        if (tokenVal && tokenVal !== "USDC") {
          throw new Error("Only USDC payments are supported in PayGrix.");
        }

        parsed = {
          requestId: url.searchParams.get("requestId") || "",
          recipient: url.searchParams.get("recipient") || "",
          recipientName: url.searchParams.get("name") || "",
          amount: url.searchParams.get("amount") || "",
          note: url.searchParams.get("note") || "",
          expiresAt: url.searchParams.get("expiresAt") || null,
          sourceType: "payment_link"
        };
      } else {
        throw new Error("Unrecognized PayGrix QR request format.");
      }

      // Payload validations
      if (!parsed.recipient || !isAddress(parsed.recipient)) {
        throw new Error("Missing or invalid recipient EVM address.");
      }
      if (parsed.recipient === "0x0000000000000000000000000000000000000000") {
        throw new Error("Recipient cannot be the zero address.");
      }
      if (parsed.amount) {
        const parsedAmt = parseFloat(parsed.amount);
        if (isNaN(parsedAmt) || parsedAmt <= 0) {
          throw new Error("Amount must be greater than zero.");
        }
        const decSplit = parsed.amount.split(".")[1];
        if (decSplit && decSplit.length > 6) {
          throw new Error("Amount exceeds USDC 6-decimal precision.");
        }
      }
      if (parsed.expiresAt) {
        const expiryDate = new Date(parsed.expiresAt);
        if (isNaN(expiryDate.getTime())) {
          throw new Error("Malformed expiry timestamp.");
        }
        if (expiryDate.getTime() < Date.now()) {
          throw new Error("This payment request has expired.");
        }
      }
      if (parsed.note && parsed.note.length > 100) {
        throw new Error("Note exceeds maximum limit of 100 characters.");
      }

      // Pre-fill
      setRecipient(parsed.recipient);
      setRecipientName(parsed.recipientName);
      setAmount(parsed.amount);
      setPaymentNote(parsed.note);
      setRequestId(parsed.requestId);
      setExpiresAt(parsed.expiresAt);
      setPaymentSource(parsed.sourceType);

      // Open screen review
      setFileScanSuccess(true);
      setActiveTab("send");
      setReviewOpen(true);
    } catch (err) {
      console.error("QR Code validation error:", err);
      setScannerError((err as Error).message || "Decoding error.");
      setFileScanSuccess(false);
    }
  };

  // Image Upload scan handler
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !html5QrcodeCtorRef.current) return;
    const file = e.target.files[0];
    setScannerError(null);
    setFileScanSuccess(false);

    const tempContainer = document.getElementById("scanner-temp-element");
    if (!tempContainer) {
      setScannerError("Temporary scanner element not found in DOM.");
      return;
    }

    try {
      const tempScanner = new html5QrcodeCtorRef.current("scanner-temp-element");
      const decodedText = await tempScanner.scanFile(file, false);
      handleQrDecoded(decodedText);
      try {
        await tempScanner.clear();
      } catch {}
    } catch (err) {
      console.error("File decode error:", err);
      setScannerError("No valid PayGrix QR code found in this image. Try another image.");
    }
  };

  // Send validation click
  const handleReviewClick = () => {
    setFormError(null);
    try {
      if (!isConnected) {
        throw new Error("Please connect your wallet first.");
      }
      if (!isArcTestnet) {
        throw new Error("Please switch your wallet to Arc Testnet network.");
      }
      if (!recipient || !isAddress(recipient)) {
        throw new Error("Please enter a valid EVM recipient address.");
      }
      if (recipient === "0x0000000000000000000000000000000000000000") {
        throw new Error("Recipient cannot be the zero address.");
      }
      if (!amount || parseFloat(amount) <= 0) {
        throw new Error("Please enter a valid transfer amount greater than zero.");
      }
      const decSplit = amount.split(".")[1];
      if (decSplit && decSplit.length > 6) {
        throw new Error("USDC only supports up to 6 decimal places.");
      }

      const amountBigInt = parseUnits(amount, 6);
      if (usdcBalanceRaw !== undefined && usdcBalanceRaw < amountBigInt) {
        throw new Error(`Insufficient USDC balance. You have ${usdcBalance} USDC.`);
      }

      if (paymentNote && paymentNote.length > 100) {
        throw new Error("Payment note must be 100 characters or less.");
      }

      if (expiresAt) {
        const exp = new Date(expiresAt);
        if (exp.getTime() < Date.now()) {
          throw new Error("This payment request has already expired.");
        }
      }

      // Duplicate check in history
      const alreadyPaid = history.some(item => item.request_id === requestId && requestId !== "");
      setIsDuplicateRequest(alreadyPaid);
      setBypassDuplicateWarning(false);

      setReviewOpen(true);
    } catch (err) {
      setFormError((err as Error).message || "Validation failed.");
    }
  };

  // Execute actual on-chain transaction
  const handleExecutePayment = async () => {
    if (!recipient || !amount || !address) return;
    
    setTxError(null);
    setTxStatus("broadcasting");
    
    try {
      const amountUnits = parseUnits(amount, 6);
      
      // Request wallet transaction
      const hash = await writeContractAsync({
        abi: erc20Abi,
        address: USDC_ADDRESS,
        functionName: "transfer",
        args: [recipient as Address, amountUnits],
        chainId: CHAIN_ID,
      });

      setTxHash(hash);
      setTxStatus("confirming");

      // Wait for block receipt
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        
        if (receipt.status === "success") {
          setTxStatus("success");
          
          // Save in database or local history
          await savePaymentToHistory(hash, amount, recipient, paymentNote, paymentSource, requestId, recipientName);
          
          // Refresh details
          refetchBalance();
          
          // Reset form fields
          setRecipient("");
          setRecipientName("");
          setAmount("");
          setPaymentNote("");
          setRequestId("");
          setExpiresAt(null);
          setPaymentSource("manual");
        } else {
          throw new Error("Transaction reverted on-chain.");
        }
      } else {
        // Fallback if public client is missing
        setTxStatus("success");
        refetchBalance();
      }
    } catch (err) {
      console.error("Payment execution error:", err);
      setTxStatus("failed");
      
      const errMsg = (err as Error).message || "";
      if (errMsg.includes("User rejected") || errMsg.includes("rejected")) {
        setTxError("Transaction signature was rejected in wallet.");
      } else {
        setTxError((err as Error).message || "An unexpected error occurred during execution.");
      }
    }
  };

  // Save transaction to history helper
  const savePaymentToHistory = async (
    hash: string, 
    amtStr: string, 
    toAddr: string, 
    noteStr: string, 
    source: string, 
    reqId: string, 
    nameStr: string
  ) => {
    if (!address) return;

    const newRecord: PaymentRecord = {
      request_id: reqId || null,
      sender_address: address.toLowerCase(),
      recipient_address: toAddr.toLowerCase(),
      recipient_name: nameStr || null,
      amount: parseFloat(amtStr),
      token_symbol: "USDC",
      token_address: USDC_ADDRESS,
      chain_id: CHAIN_ID,
      network: "Arc Testnet",
      tx_hash: hash,
      note: noteStr || null,
      source_type: source,
      status: "confirmed",
      created_at: new Date().toISOString()
    };

    try {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from("pay_history").insert([newRecord]);
        if (error) {
          console.error("Supabase insert failed, saving locally:", error);
          saveLocally(newRecord);
        }
      } else {
        saveLocally(newRecord);
      }
    } catch {
      saveLocally(newRecord);
    }
    loadHistory();
  };

  const saveLocally = (record: PaymentRecord) => {
    if (!address) return;
    const localKey = `paygrid_history_${address.toLowerCase()}`;
    const localData = localStorage.getItem(localKey);
    let list: PaymentRecord[] = [];
    if (localData) {
      try {
        list = JSON.parse(localData);
      } catch {
        // ignore json parsing errors
      }
    }
    list.unshift(record);
    localStorage.setItem(localKey, JSON.stringify(list));
  };

  // Filter and Search history
  const filteredHistory = history.filter((item) => {
    // Type Filter
    if (historyFilter !== "all" && item.source_type !== historyFilter) {
      return false;
    }
    
    // Search Query
    if (historySearch) {
      const q = historySearch.toLowerCase();
      const matchAddress = item.recipient_address.toLowerCase().includes(q) || item.sender_address.toLowerCase().includes(q);
      const matchName = item.recipient_name?.toLowerCase().includes(q);
      const matchHash = item.tx_hash.toLowerCase().includes(q);
      const matchReq = item.request_id?.toLowerCase().includes(q);
      
      return matchAddress || matchName || matchHash || matchReq;
    }
    
    return true;
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <QrCode className="h-7 w-7 text-[#4f8cff]" />
              Pay
            </h1>
            <p className="text-sm text-slate-400">
              P2P USDC transfers with QR code scanner and payment requests on Arc Testnet.
            </p>
          </div>
          
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-[#4f8cff]/20 bg-[#2563ff]/5 text-[#60a5fa] px-3 py-1 text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_15px_rgba(79,140,255,0.1)]">
              <Sparkles className="h-3 w-3 text-[#4f8cff]" />
              Arc Testnet
            </Badge>
          </div>
        </div>

        {/* Global Warnings */}
        {urlError && (
          <div className="p-4 bg-red-950/20 border border-red-500/30 rounded-xl flex gap-3 text-red-200 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-300">Link Parsing Error</p>
              <p className="mt-0.5 text-xs text-red-200/80">{urlError}</p>
            </div>
          </div>
        )}

        {/* Tabs Bar */}
        <div className="flex rounded-xl p-1 bg-slate-950 border border-slate-900 shadow-inner">
          {(["send", "receive", "scan", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setFormError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold capitalize transition-all duration-200 ${
                activeTab === tab
                  ? "bg-[#6d5dfc]/15 border border-[#6d5dfc]/35 text-white shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {tab === "send" && <Send className="h-4 w-4" />}
              {tab === "receive" && <QrCode className="h-4 w-4" />}
              {tab === "scan" && <ScanLine className="h-4 w-4" />}
              {tab === "history" && <Clock className="h-4 w-4" />}
              {tab}
            </button>
          ))}
        </div>

        {/* Dynamic Card Display */}
        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/20 via-transparent to-[#6d5dfc]/5 pointer-events-none" />
          
          <CardContent className="p-6 relative z-10">
            {/* Wallet status banner */}
            {!isConnected && activeTab !== "history" && (
              <div className="mb-6 p-6 border border-slate-800 bg-slate-950/40 rounded-2xl text-center space-y-4 flex flex-col items-center justify-center">
                <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                  <Wallet className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-white">Wallet Connection Required</p>
                  <p className="text-xs text-slate-500 max-w-sm">
                    Connect your EVM wallet to generate QR codes, scan requests, and send real USDC.
                  </p>
                </div>
              </div>
            )}

            {/* Network check banner */}
            {isConnected && !isArcTestnet && activeTab !== "history" && (
              <div className="mb-6 p-4 border border-amber-500/25 bg-amber-500/5 rounded-xl flex gap-3 text-amber-200 text-sm">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-300">Unsupported Network</p>
                  <p className="text-xs text-amber-400/80 mt-0.5">
                    PayGrix QR module runs exclusively on **Arc Testnet (Chain ID: 5042002)**. Switch your wallet to proceed.
                  </p>
                </div>
              </div>
            )}

            {/* SEND TAB */}
            {activeTab === "send" && (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between border-b border-slate-800 pb-4">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-white">Send USDC</h3>
                    <p className="text-xs text-slate-500">Enter recipient details or pre-fill via scan/link.</p>
                  </div>
                  {isConnected && (
                    <div className="bg-slate-950 border border-slate-800/80 rounded-xl px-4 py-2 flex items-center gap-4 shrink-0">
                      <div className="space-y-0.5">
                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">USDC Balance</p>
                        <p className="text-sm font-bold text-white flex items-center gap-1.5">
                          {isBalanceLoading ? (
                            <RefreshCw className="h-3 w-3 animate-spin text-[#4f8cff]" />
                          ) : (
                            `${usdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC`
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Recipient Address */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recipient EVM Address</label>
                    <input
                      type="text"
                      placeholder="0x..."
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value.trim())}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-[#6d5dfc]/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#6d5dfc]/50 transition-all font-mono"
                    />
                    
                    {/* Contract warnings */}
                    {isContractRecipient && (
                      <p className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Recipient is a smart contract address. Verify destination supports USDC before sending.
                      </p>
                    )}
                    {isSelfTransfer && (
                      <p className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Recipient is the same as the connected sender address.
                      </p>
                    )}
                  </div>

                  {/* Recipient Name */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recipient Name (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Alice"
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-[#6d5dfc]/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#6d5dfc]/50 transition-all"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Amount Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between">
                      <span>USDC Amount</span>
                      <span className="text-[10px] text-slate-500 font-normal">Min: 0.000001</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-[#6d5dfc]/50 rounded-xl pl-4 pr-16 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#6d5dfc]/50 transition-all font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setAmount(usdcBalance.toString())}
                        className="absolute right-2 top-1.5 bg-[#6d5dfc]/10 hover:bg-[#6d5dfc]/25 border border-[#6d5dfc]/30 text-white font-bold text-[10px] uppercase px-2.5 py-1.5 rounded-lg transition-all"
                      >
                        Max
                      </button>
                    </div>
                  </div>

                  {/* Payment Note */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between">
                      <span>Payment Note (Optional)</span>
                      <span className="text-[10px] text-slate-500 font-normal">{paymentNote.length}/100</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dinner share"
                      value={paymentNote}
                      maxLength={100}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-[#6d5dfc]/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-[#6d5dfc]/50 transition-all"
                    />
                  </div>
                </div>

                {formError && (
                  <div className="p-3 bg-red-950/20 border border-red-500/20 text-red-300 text-xs rounded-lg flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Submit Action */}
                <div className="pt-2">
                  <Button
                    onClick={handleReviewClick}
                    disabled={!isConnected || !isArcTestnet}
                    className="w-full h-11 bg-gradient-to-r from-[#4f8cff] to-[#6d5dfc] hover:from-[#2563ff] hover:to-[#4f46e5] text-white font-bold rounded-xl shadow-lg hover:shadow-[0_0_20px_rgba(109,93,252,0.4)] disabled:opacity-50 transition-all duration-300"
                  >
                    Review Payment Details
                  </Button>
                </div>
              </div>
            )}

            {/* RECEIVE QR TAB */}
            {activeTab === "receive" && (
              <div className="space-y-6">
                <div className="space-y-1 border-b border-slate-800 pb-4">
                  <h3 className="font-semibold text-white">Generate Payment Request</h3>
                  <p className="text-xs text-slate-500">Create a QR request code or shareable payment link.</p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Left Controls */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Your Recipient Address</label>
                      <input
                        type="text"
                        disabled
                        value={address || "Wallet not connected"}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-500 font-mono focus:outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Your Display Name (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Alice"
                        value={recvName}
                        onChange={(e) => setRecvName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-[#6d5dfc]/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none transition-all"
                      />
                    </div>

                    <div className="grid gap-4 grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount (Optional)</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={recvAmount}
                          onChange={(e) => setRecvAmount(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-[#6d5dfc]/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none transition-all font-mono"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Request Expiry</label>
                        <select
                          value={recvExpiry}
                          onChange={(e) => setRecvExpiry(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-[#6d5dfc]/50 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none transition-all"
                        >
                          <option value="never">No Expiry</option>
                          <option value="15m">15 Minutes</option>
                          <option value="1h">1 Hour</option>
                          <option value="24h">24 Hours</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between">
                        <span>Payment Note (Optional)</span>
                        <span className="text-[10px] text-slate-500 font-normal">{recvNote.length}/100</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Pizza contribution"
                        value={recvNote}
                        maxLength={100}
                        onChange={(e) => setRecvNote(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 focus:border-[#6d5dfc]/50 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none transition-all"
                      />
                    </div>

                    <Button
                      onClick={handleGenerateQR}
                      disabled={!isConnected}
                      className="w-full h-11 bg-[#6d5dfc]/15 hover:bg-[#6d5dfc]/25 border border-[#6d5dfc]/40 hover:border-[#6d5dfc]/70 text-white font-bold rounded-xl transition-all"
                    >
                      Generate QR Code
                    </Button>
                  </div>

                  {/* Right QR Display Canvas */}
                  <div className="flex flex-col items-center justify-center p-6 border border-slate-800/80 bg-slate-950/40 rounded-2xl relative min-h-[350px]">
                    {generatedLink ? (
                      <div className="space-y-6 w-full max-w-xs flex flex-col items-center">
                        {/* QR Canvas wrapped inside safe high-contrast frame */}
                        <div className="p-4 bg-white rounded-2xl shadow-xl flex items-center justify-center">
                          <QRCodeCanvas
                            id="paygrid-qr-canvas"
                            value={generatedLink}
                            size={180}
                            level="H" // High error correction
                            includeMargin={false}
                          />
                        </div>

                        {/* Meta Info summary */}
                        <div className="w-full space-y-1.5 text-center text-xs">
                          <p className="font-semibold text-white">USDC Payment Request</p>
                          {recvAmount && (
                            <p className="text-sm font-bold text-[#4f8cff]">{recvAmount} USDC</p>
                          )}
                          {recvExpiresAt && (
                            <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
                              <Clock className="h-3 w-3" />
                              Expires: {new Date(recvExpiresAt).toLocaleTimeString()}
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="grid grid-cols-2 gap-2 w-full">
                          <button
                            onClick={handleDownloadQR}
                            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition-all font-semibold"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </button>
                          <button
                            onClick={handleShareLink}
                            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition-all font-semibold"
                          >
                            <Share2 className="h-3.5 w-3.5" />
                            Share
                          </button>
                        </div>

                        <div className="w-full space-y-1">
                          <button
                            onClick={() => handleCopy(generatedJson, "json")}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[10px] bg-slate-950 border border-slate-900 text-slate-400 hover:text-white transition-all font-mono"
                          >
                            <span>Copy Payload Data (JSON)</span>
                            {copiedText === "json" ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                          
                          <button
                            onClick={() => handleCopy(generatedLink, "link")}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[10px] bg-slate-950 border border-slate-900 text-slate-400 hover:text-white transition-all font-mono truncate"
                          >
                            <span className="truncate mr-3">Link: {generatedLink}</span>
                            {copiedText === "link" ? (
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center space-y-2">
                        <QrCode className="h-16 w-16 text-slate-700 stroke-[1.5] mx-auto animate-pulse" />
                        <p className="text-xs text-slate-500">
                          Fill out the details on the left and click &quot;Generate&quot; to create a custom payment QR code.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SCAN QR TAB */}
            {activeTab === "scan" && (
              <div className="space-y-6">
                <div className="space-y-1 border-b border-slate-800 pb-4">
                  <h3 className="font-semibold text-white">Scan Payment Request</h3>
                  <p className="text-xs text-slate-500">Scan via camera feed, upload an image file, or paste QR data.</p>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Left Column: Live camera view */}
                  <div className="flex flex-col items-center justify-center p-6 border border-slate-800 bg-slate-950/40 rounded-2xl relative min-h-[350px]">
                    <div 
                      id="scanner-feed-container" 
                      className={`relative w-full max-w-xs aspect-square overflow-hidden rounded-xl border border-slate-800 bg-black flex items-center justify-center ${
                        scannerActive ? "opacity-100" : "opacity-40"
                      }`}
                    >
                      {!scannerActive && (
                        <div className="text-center p-4 space-y-3 relative z-10">
                          <ScanLine className="h-10 w-10 text-slate-600 mx-auto animate-pulse" />
                          <p className="text-[11px] text-slate-500">Camera scanner is inactive.</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Camera Control button */}
                    <div className="mt-6 w-full max-w-xs">
                      {scannerActive ? (
                        <Button
                          onClick={stopCamera}
                          className="w-full h-10 bg-red-950/20 border border-red-500/30 text-red-400 font-bold rounded-xl"
                        >
                          Stop Camera Scanning
                        </Button>
                      ) : (
                        <Button
                          onClick={startCamera}
                          disabled={!isConnected || !isArcTestnet}
                          className="w-full h-10 bg-[#6d5dfc]/15 hover:bg-[#6d5dfc]/25 border border-[#6d5dfc]/40 hover:border-[#6d5dfc]/70 text-white font-bold rounded-xl"
                        >
                          Start Camera Scanning
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Upload QR File fallback and manual paste */}
                  <div className="space-y-6">
                    {/* File Upload Option */}
                    <div className="p-5 border border-slate-800/80 bg-slate-950/20 rounded-2xl space-y-4">
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Option 1: Upload QR Image</h4>
                        <p className="text-[11px] text-slate-500">Select a QR code screenshot or image file from your device.</p>
                      </div>
                      
                      <div className="relative border border-dashed border-slate-800 hover:border-slate-700 bg-slate-950 rounded-xl p-6 text-center cursor-pointer transition-all">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={!isConnected}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <Download className="h-6 w-6 text-slate-500 mx-auto mb-2" />
                        <p className="text-xs font-semibold text-slate-300">Choose Image File</p>
                        <p className="text-[10px] text-slate-500 mt-1">Supports PNG, JPG, JPEG</p>
                      </div>

                      {/* Hidden div container required by html5-qrcode for rendering scans internally */}
                      <div id="scanner-temp-element" className="hidden" />
                    </div>

                    {/* Manual Payload Paste Option */}
                    <div className="p-5 border border-slate-800/80 bg-slate-950/20 rounded-2xl space-y-4">
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Option 2: Paste Payment Link / JSON</h4>
                        <p className="text-[11px] text-slate-500">Paste the raw payload JSON or shareable payment link URL.</p>
                      </div>

                      <div className="space-y-2">
                        <textarea
                          placeholder="Paste paygrid-payment JSON or URL here..."
                          rows={3}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            if (val) handleQrDecoded(val);
                          }}
                          disabled={!isConnected}
                          className="w-full bg-slate-950 border border-slate-800 focus:border-[#6d5dfc]/50 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none transition-all font-mono resize-none"
                        />
                      </div>
                    </div>
                    
                    {scannerError && (
                      <div className="p-3 bg-red-950/20 border border-red-500/25 rounded-xl text-red-300 text-xs flex gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>{scannerError}</span>
                      </div>
                    )}

                    {fileScanSuccess && (
                      <div className="p-3 bg-green-950/20 border border-green-500/20 text-green-300 text-xs rounded-xl flex items-center gap-2">
                        <Check className="h-4 w-4 shrink-0 text-green-500" />
                        <span>QR Payload read successfully. Review form details.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* HISTORY TAB */}
            {activeTab === "history" && (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-white">Recent Payments</h3>
                    <p className="text-xs text-slate-500">
                      {isSupabaseConfigured ? "Synched payments database history." : "Local device payment logs only."}
                    </p>
                  </div>
                  
                  {/* Local storage badge reminder */}
                  {!isSupabaseConfigured && (
                    <Badge variant="outline" className="border-amber-500/20 bg-amber-500/5 text-amber-400 text-[10px] uppercase font-bold py-1">
                      Local device history fallback
                    </Badge>
                  )}
                </div>

                {/* Filters and Search toolbar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {/* Search */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search recipient, name, TX hash, request ID..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-[#6d5dfc]/50 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-600 focus:outline-none transition-all"
                    />
                  </div>

                  {/* Filter tabs */}
                  <div className="flex rounded-lg bg-slate-950 border border-slate-900 p-0.5 shrink-0 overflow-x-auto">
                    {(["all", "manual", "qr", "payment_link"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setHistoryFilter(mode)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-bold capitalize whitespace-nowrap transition-all ${
                          historyFilter === mode
                            ? "bg-slate-900 text-white border border-slate-800"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        {mode === "all" && "All"}
                        {mode === "manual" && "Manual"}
                        {mode === "qr" && "QR"}
                        {mode === "payment_link" && "Link"}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={loadHistory}
                    disabled={isHistoryLoading}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 hover:text-white text-slate-400 transition-all shrink-0"
                    title="Refresh List"
                  >
                    <RefreshCw className={`h-4.5 w-4.5 ${isHistoryLoading ? "animate-spin text-[#4f8cff]" : ""}`} />
                  </button>
                </div>

                {/* History table list */}
                {isHistoryLoading && history.length === 0 ? (
                  <div className="text-center py-12">
                    <RefreshCw className="h-8 w-8 animate-spin text-[#4f8cff] mx-auto mb-3" />
                    <p className="text-xs text-slate-500">Loading history records...</p>
                  </div>
                ) : filteredHistory.length > 0 ? (
                  <div className="space-y-3">
                    {filteredHistory.map((item, idx) => {
                      const isSender = address?.toLowerCase() === item.sender_address.toLowerCase();
                      
                      return (
                        <div 
                          key={item.tx_hash || idx}
                          className="p-4 border border-slate-800/80 bg-slate-950/30 hover:bg-slate-950/60 rounded-xl transition-all flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-start gap-3">
                            {/* Direction Badge Icon */}
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border ${
                              isSender 
                                ? "bg-red-950/15 border-red-900/40 text-red-400" 
                                : "bg-green-950/15 border-green-900/40 text-green-400"
                            }`}>
                              {isSender ? "OUT" : "IN"}
                            </div>
                            
                            <div className="space-y-0.5">
                              {/* Recipient / Sender Name and Address */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-white">
                                  {isSender 
                                    ? (item.recipient_name ? `${item.recipient_name} (${item.recipient_address.slice(0, 6)}...)` : item.recipient_address.slice(0, 14) + "...")
                                    : `From: ${item.sender_address.slice(0, 14)}...`
                                  }
                                </span>
                                
                                <Badge variant="outline" className="text-[9px] scale-90 tracking-wide font-semibold border-slate-800 bg-slate-900 text-slate-400 px-1.5 py-0.5">
                                  {item.source_type}
                                </Badge>
                              </div>

                              {/* Timestamp details */}
                              <p className="text-[10px] text-slate-500">
                                {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString()}
                              </p>
                              
                              {/* Note if available */}
                              {item.note && (
                                <p className="text-xs text-slate-400 bg-slate-950 border border-slate-900 px-2 py-0.5 rounded italic max-w-sm inline-block">
                                  &quot;{item.note}&quot;
                                </p>
                              )}

                              {/* Request ID link metadata */}
                              {item.request_id && (
                                <p className="text-[9px] text-slate-600 font-mono">
                                  Request ID: {item.request_id}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 justify-between sm:justify-end sm:text-right border-t border-slate-900 pt-3 sm:pt-0 sm:border-0">
                            {/* Amount */}
                            <div className="space-y-0.5">
                              <p className={`text-sm font-bold ${isSender ? "text-slate-200" : "text-green-400"}`}>
                                {isSender ? "-" : "+"}{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDC
                              </p>
                              <p className="text-[10px] text-slate-500">Arc Testnet</p>
                            </div>

                            {/* Explorer Link & Copy */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleCopy(item.tx_hash, `tx_${idx}`)}
                                className="p-2 bg-slate-950 hover:bg-slate-900 border border-slate-900 rounded-lg text-slate-400 hover:text-white transition-all"
                                title="Copy TX Hash"
                              >
                                {copiedText === `tx_${idx}` ? (
                                  <Check className="h-3.5 w-3.5 text-green-500" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                              
                              <a
                                href={`${EXPLORER_URL}/tx/${item.tx_hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 bg-slate-950 hover:bg-slate-900 border border-slate-900 rounded-lg text-slate-400 hover:text-white transition-all flex items-center justify-center"
                                title="View on ArcScan"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 border border-slate-800 bg-slate-950/10 rounded-2xl space-y-2">
                    <Clock className="h-10 w-10 text-slate-800 mx-auto" />
                    <p className="text-xs text-slate-500">No payment transactions found matching filter.</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* REVIEW MODAL OVERLAY */}
      {reviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 space-y-6">
            
            {/* Header */}
            <div className="text-center border-b border-slate-800 pb-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Payment Request Review</h3>
              <p className="text-2xl font-black text-white mt-2 flex items-center justify-center gap-1">
                {amount} <span className="text-xs text-[#4f8cff] font-bold">USDC</span>
              </p>
            </div>

            {/* Warning duplicated request ID */}
            {isDuplicateRequest && (
              <div className="p-3 bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs rounded-xl flex flex-col gap-2">
                <div className="flex gap-2 items-start">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>This payment request ID has already been paid in your logs. Are you sure you want to duplicate this payment?</span>
                </div>
                <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={bypassDuplicateWarning}
                    onChange={(e) => setBypassDuplicateWarning(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-800 text-[#6d5dfc] focus:ring-0"
                  />
                  <span className="font-semibold text-[10px] text-amber-300">Confirm intentional repeat payment</span>
                </label>
              </div>
            )}

            {/* Expiry Warning in Review */}
            {expiresAt && (
              <div className="p-3 bg-blue-950/20 border border-[#4f8cff]/20 text-[#60a5fa] text-xs rounded-xl flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-[#4f8cff]" />
                <span>
                  Request expires at: {new Date(expiresAt).toLocaleTimeString()} ({new Date(expiresAt).toLocaleDateString()})
                </span>
              </div>
            )}

            {/* Meta Grid details */}
            <div className="space-y-3.5 text-xs">
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-500">Recipient Name</span>
                <span className="font-bold text-white">{recipientName || "None"}</span>
              </div>

              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-500">Recipient Address</span>
                <span className="font-mono text-white tracking-wider">{recipient.slice(0, 8)}...{recipient.slice(-6)}</span>
              </div>

              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-500">Sender Address</span>
                <span className="font-mono text-slate-400">{address ? `${address.slice(0, 8)}...${address.slice(-6)}` : ""}</span>
              </div>

              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-500">Network / Gas Fee</span>
                <span className="font-semibold text-slate-300">Arc Testnet / Normal Flow Gas</span>
              </div>

              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-500">Payment Source</span>
                <span className="font-bold text-[#4f8cff] uppercase tracking-wide text-[10px]">{paymentSource}</span>
              </div>

              {paymentNote && (
                <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-900 italic text-slate-300">
                  <span className="text-[10px] font-semibold text-slate-500 block not-italic uppercase tracking-wider mb-1">Note</span>
                  &quot;{paymentNote}&quot;
                </div>
              )}
            </div>

            {/* Execute transaction state handler overlay */}
            {txStatus !== "idle" && (
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3.5 text-center flex flex-col items-center justify-center">
                {txStatus === "broadcasting" && (
                  <>
                    <RefreshCw className="h-7 w-7 animate-spin text-[#4f8cff]" />
                    <p className="text-xs font-semibold text-white">Broadcasting to network...</p>
                    <p className="text-[10px] text-slate-500">Sign the transaction in your connected wallet.</p>
                  </>
                )}
                {txStatus === "confirming" && (
                  <>
                    <RefreshCw className="h-7 w-7 animate-spin text-[#6d5dfc]" />
                    <p className="text-xs font-semibold text-white">Confirming transaction on-chain...</p>
                    <p className="text-[10px] text-slate-500 font-mono truncate max-w-[280px]">Hash: {txHash}</p>
                  </>
                )}
                {txStatus === "success" && (
                  <div className="space-y-3 w-full">
                    <div className="h-10 w-10 rounded-full bg-green-950/20 border border-green-500/30 flex items-center justify-center text-green-500 mx-auto">
                      <Check className="h-6 w-6 text-green-500" />
                    </div>
                    <p className="text-xs font-bold text-white">Payment Confirmed!</p>
                    
                    <div className="bg-slate-950 border border-slate-900 p-3 rounded-xl space-y-1.5 text-left text-[11px] w-full">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Recipient</span>
                        <span className="font-mono text-white">{recipient.slice(0, 10)}...{recipient.slice(-8)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Amount Sent</span>
                        <span className="font-bold text-white">{amount} USDC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Updated Balance</span>
                        <span className="font-semibold text-[#4f8cff]">{(usdcBalance - parseFloat(amount)).toLocaleString(undefined, { minimumFractionDigits: 2 })} USDC</span>
                      </div>
                    </div>

                    <div className="flex gap-2 w-full pt-1">
                      <button
                        onClick={() => handleCopy(txHash, "modal_hash")}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs bg-slate-950 border border-slate-900 text-slate-400 hover:text-white transition-all font-semibold"
                      >
                        {copiedText === "modal_hash" ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy Hash
                          </>
                        )}
                      </button>
                      <a
                        href={`${EXPLORER_URL}/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs bg-[#4f8cff]/10 border border-[#4f8cff]/20 text-[#60a5fa] hover:text-white hover:bg-[#4f8cff]/25 transition-all font-semibold"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        ArcScan link
                      </a>
                    </div>

                    <Button
                      onClick={() => {
                        setReviewOpen(false);
                        setTxStatus("idle");
                        setTxHash("");
                      }}
                      className="w-full h-10 bg-slate-900 border border-slate-800 hover:border-slate-700 text-white font-bold rounded-xl mt-2"
                    >
                      Dismiss View
                    </Button>
                  </div>
                )}
                {txStatus === "failed" && (
                  <div className="space-y-3 w-full">
                    <div className="h-10 w-10 rounded-full bg-red-950/20 border border-red-500/30 flex items-center justify-center text-red-500 mx-auto">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <p className="text-xs font-bold text-red-400">Payment Failed</p>
                    <p className="text-[11px] text-red-200/80 bg-red-950/20 border border-red-900/30 p-2.5 rounded-lg max-h-[100px] overflow-y-auto font-mono text-left select-text">
                      {txError}
                    </p>
                    <div className="flex gap-2 w-full pt-1">
                      <Button
                        onClick={() => setTxStatus("idle")}
                        className="flex-1 h-9 bg-slate-900 border border-slate-800 hover:border-slate-700 text-white font-bold rounded-xl text-xs"
                      >
                        Go Back
                      </Button>
                      <Button
                        onClick={handleExecutePayment}
                        className="flex-1 h-9 bg-gradient-to-r from-[#4f8cff] to-[#6d5dfc] text-white font-bold rounded-xl text-xs"
                      >
                        Retry Send
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cancel/Confirm action triggers when idle */}
            {txStatus === "idle" && (
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => setReviewOpen(false)}
                  className="flex-1 h-11 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white font-bold rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleExecutePayment}
                  disabled={isDuplicateRequest && !bypassDuplicateWarning}
                  className="flex-1 h-11 bg-gradient-to-r from-[#4f8cff] to-[#6d5dfc] text-white font-bold rounded-xl shadow-lg hover:shadow-[0_0_20px_rgba(109,93,252,0.4)] transition-all disabled:opacity-40"
                >
                  Confirm & Pay
                </Button>
              </div>
            )}

          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function PayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-foreground flex items-center justify-center text-sm font-semibold">Loading PayGrix module...</div>}>
      <PayPageContent />
    </Suspense>
  );
}
