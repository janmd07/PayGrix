import React from 'react';
import { DollarSign, Clock, ShieldAlert, CheckCircle2, UserCheck, FileText } from 'lucide-react';
import { EscrowItem } from '../types/escrow';

interface EscrowCardProps {
  escrow: EscrowItem;
  onFund: (id: string) => void;
  onSubmitEvidence: (id: string) => void;
  onRaiseDispute: (id: string) => void;
  onAdjudicate: (id: string) => void;
  onSettle: (id: string) => void;
}

export const EscrowCard: React.FC<EscrowCardProps> = ({
  escrow,
  onFund,
  onSubmitEvidence,
  onRaiseDispute,
  onAdjudicate,
  onSettle
}) => {
  const isExpired = Math.floor(Date.now() / 1000) > escrow.expirationTimestamp;

  return (
    <div className="glass-panel" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <span className="network-badge badge-base" style={{ marginBottom: '8px' }}>Base Sepolia</span>
          <h3 className="form-mono" style={{ fontSize: '14px', fontWeight: 600, color: '#94a3b8' }}>
            ID: {escrow.escrowId.slice(0, 10)}...{escrow.escrowId.slice(-6)}
          </h3>
        </div>
        <span className={`state-pill state-${escrow.state}`}>{escrow.state}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Depositor</div>
          <div className="form-mono" style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {escrow.depositor.slice(0, 6)}...{escrow.depositor.slice(-4)}
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Beneficiary</div>
          <div className="form-mono" style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {escrow.beneficiary.slice(0, 6)}...{escrow.beneficiary.slice(-4)}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0', padding: '12px', background: 'rgba(0, 82, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(0, 82, 255, 0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DollarSign size={18} color="#60a5fa" />
          <span style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>{escrow.amount} USDC</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#94a3b8' }}>
          <Clock size={14} />
          <span>{new Date(escrow.expirationTimestamp * 1000).toLocaleDateString()}</span>
        </div>
      </div>

      {escrow.evidenceURI && (
        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileText size={14} color="#a855f7" />
          <span>Evidence: <a href={escrow.evidenceURI} target="_blank" rel="noreferrer" style={{ color: '#a5b4fc' }}>IPFS Reference</a></span>
        </div>
      )}

      {/* Action Buttons based on Escrow State */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px' }}>
        {escrow.state === 'CREATED' && (
          <button className="btn btn-primary" onClick={() => onFund(escrow.escrowId)} style={{ flex: 1 }}>
            <DollarSign size={14} /> Fund Escrow
          </button>
        )}

        {escrow.state === 'FUNDED' && (
          <>
            <button className="btn btn-secondary" onClick={() => onSubmitEvidence(escrow.escrowId)}>
              <FileText size={14} /> Evidence
            </button>
            <button className="btn btn-danger" onClick={() => onRaiseDispute(escrow.escrowId)} style={{ flex: 1 }}>
              <ShieldAlert size={14} /> Raise Dispute
            </button>
          </>
        )}

        {escrow.state === 'DISPUTED' && (
          <button className="btn btn-primary" onClick={() => onAdjudicate(escrow.escrowId)} style={{ width: '100%', background: 'linear-gradient(135deg, #a855f7, #06b6d4)' }}>
            <ShieldAlert size={14} /> Send to GenLayer Bradbury
          </button>
        )}

        {escrow.state === 'ADJUDICATION_PENDING' && (
          <button className="btn btn-primary" onClick={() => onSettle(escrow.escrowId)} style={{ width: '100%' }}>
            <CheckCircle2 size={14} /> Receive & Settle Verdict
          </button>
        )}
      </div>
    </div>
  );
};
