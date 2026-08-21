export type EscrowState = 
  | 'CREATED'
  | 'FUNDED'
  | 'DISPUTED'
  | 'ADJUDICATION_PENDING'
  | 'RELEASED'
  | 'REFUNDED'
  | 'UNDETERMINED_RESOLVED'
  | 'EXPIRED_REFUNDED'
  | 'EMERGENCY_REFUNDED';

export type VerdictCode = 1 | 2 | 3; // 1 = APPROVED, 2 = REJECTED, 3 = UNDETERMINED

export interface EscrowItem {
  escrowId: string;
  depositor: string;
  beneficiary: string;
  amount: string; // formatted USDC string e.g. "1,500.00"
  rawAmount: number;
  createdAt: number;
  expirationTimestamp: number;
  evidenceHash?: string;
  evidenceURI?: string;
  state: EscrowState;
  adjudicationNonce: number;
  verdictCode?: VerdictCode;
  reasoningSummary?: string;
  claimantStatement?: string;
  respondentStatement?: string;
}

export interface TransactionRecord {
  id: string;
  escrowId: string;
  type: 'CREATE' | 'FUND' | 'EVIDENCE' | 'DISPUTE' | 'ADJUDICATE' | 'SETTLE';
  network: 'BASE_SEPOLIA' | 'GENLAYER_BRADBURY';
  txHash: string;
  timestamp: number;
  status: 'SUCCESS' | 'PENDING' | 'DRY_RUN';
  description: string;
}
