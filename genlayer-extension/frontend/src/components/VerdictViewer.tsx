import React from 'react';
import { CheckCircle2, XCircle, HelpCircle, FileCheck, ArrowRightLeft } from 'lucide-react';
import { EscrowItem } from '../types/escrow';

interface VerdictViewerProps {
  escrow: EscrowItem;
  onConfirmSettlement: (escrowId: string) => void;
}

export const VerdictViewer: React.FC<VerdictViewerProps> = ({ escrow, onConfirmSettlement }) => {
  if (!escrow.verdictCode) return null;

  const getVerdictDetails = () => {
    switch (escrow.verdictCode) {
      case 1:
        return {
          title: 'APPROVED — Release 100% to Beneficiary',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.1)',
          border: 'rgba(16, 185, 129, 0.3)',
          icon: <CheckCircle2 size={24} color="#10b981" />,
          desc: 'GenLayer validator consensus determined deliverable terms were fulfilled.'
        };
      case 2:
        return {
          title: 'REJECTED — Refund 100% to Depositor',
          color: '#ef4444',
          bg: 'rgba(239, 68, 68, 0.1)',
          border: 'rgba(239, 68, 68, 0.3)',
          icon: <XCircle size={24} color="#ef4444" />,
          desc: 'GenLayer validator consensus determined terms were breached.'
        };
      case 3:
      default:
        return {
          title: 'UNDETERMINED — Safest Fallback Refund',
          color: '#f59e0b',
          bg: 'rgba(245, 158, 11, 0.1)',
          border: 'rgba(245, 158, 11, 0.3)',
          icon: <HelpCircle size={24} color="#f59e0b" />,
          desc: 'Inconclusive or unreachable evidence. Safe non-custodial capital refund applied.'
        };
    }
  };

  const info = getVerdictDetails();

  return (
    <div className="glass-panel" style={{ background: info.bg, borderColor: info.border }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        {info.icon}
        <div>
          <span className="network-badge badge-genlayer" style={{ fontSize: '10px', marginBottom: '4px' }}>Finalized Consensus Verdict</span>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: info.color }}>{info.title}</h3>
        </div>
      </div>

      <p style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '16px', lineHeight: 1.5 }}>
        {info.desc}
      </p>

      {escrow.reasoningSummary && (
        <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: '#94a3b8' }}>Reasoning Summary: </span>
          <span style={{ color: '#f8fafc' }}>{escrow.reasoningSummary}</span>
        </div>
      )}

      {escrow.state === 'ADJUDICATION_PENDING' && (
        <button 
          className="btn btn-primary" 
          onClick={() => onConfirmSettlement(escrow.escrowId)}
          style={{ width: '100%' }}
        >
          <ArrowRightLeft size={16} /> Execute Base Sepolia USDC Settlement
        </button>
      )}
    </div>
  );
};
