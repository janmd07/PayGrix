import React, { useState } from 'react';
import { ShieldCheck, Cpu, Layers, History, AlertCircle, PlusCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { EscrowItem, TransactionRecord, VerdictCode } from './types/escrow';
import { EscrowForm } from './components/EscrowForm';
import { EscrowCard } from './components/EscrowCard';
import { DisputePanel } from './components/DisputePanel';
import { VerdictViewer } from './components/VerdictViewer';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ESCROWS' | 'CREATE' | 'DISPUTES' | 'HISTORY'>('ESCROWS');
  const [selectedEscrowId, setSelectedEscrowId] = useState<string | null>(null);

  // Initial Mock State for demonstration
  const [escrows, setEscrows] = useState<EscrowItem[]>([
    {
      escrowId: '0xa1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
      depositor: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      beneficiary: '0x1234567890abcdef1234567890abcdef12345678',
      amount: '1,500.00',
      rawAmount: 1500,
      createdAt: Math.floor(Date.now() / 1000) - 86400 * 2,
      expirationTimestamp: Math.floor(Date.now() / 1000) + 86400 * 5,
      evidenceHash: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
      evidenceURI: 'https://ipfs.io/ipfs/QmPayGrixSampleEvidenceHash',
      state: 'DISPUTED',
      adjudicationNonce: 1
    },
    {
      escrowId: '0xb2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef01',
      depositor: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      beneficiary: '0x9876543210fedcba9876543210fedcba98765432',
      amount: '500.00',
      rawAmount: 500,
      createdAt: Math.floor(Date.now() / 1000) - 86400,
      expirationTimestamp: Math.floor(Date.now() / 1000) + 86400 * 6,
      state: 'FUNDED',
      adjudicationNonce: 0
    }
  ]);

  const [txHistory, setTxHistory] = useState<TransactionRecord[]>([
    {
      id: 'tx-1',
      escrowId: '0xa1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
      type: 'CREATE',
      network: 'BASE_SEPOLIA',
      txHash: '0x4f8a123...bc4',
      timestamp: Date.now() - 86400 * 2000,
      status: 'SUCCESS',
      description: 'Created 1,500.00 USDC Escrow'
    },
    {
      id: 'tx-2',
      escrowId: '0xa1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
      type: 'DISPUTE',
      network: 'BASE_SEPOLIA',
      txHash: '0x9a8b7c...def',
      timestamp: Date.now() - 86400 * 1000,
      status: 'SUCCESS',
      description: 'Dispute raised by Depositor'
    }
  ]);

  const handleCreateEscrow = (newEscrow: Omit<EscrowItem, 'escrowId' | 'createdAt' | 'adjudicationNonce'>) => {
    const id = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const created: EscrowItem = {
      ...newEscrow,
      escrowId: id,
      createdAt: Math.floor(Date.now() / 1000),
      adjudicationNonce: 0
    };

    setEscrows([created, ...escrows]);
    setTxHistory([
      {
        id: 'tx-' + Date.now(),
        escrowId: id,
        type: 'CREATE',
        network: 'BASE_SEPOLIA',
        txHash: '0x' + Math.random().toString(16).slice(2, 10) + '...',
        timestamp: Date.now(),
        status: 'SUCCESS',
        description: `Created ${newEscrow.amount} USDC Escrow`
      },
      ...txHistory
    ]);

    setActiveTab('ESCROWS');
  };

  const handleFund = (id: string) => {
    setEscrows(escrows.map(e => e.escrowId === id ? { ...e, state: 'FUNDED' } : e));
  };

  const handleSubmitEvidence = (id: string) => {
    const uri = prompt('Enter IPFS Evidence Reference URI:', 'https://ipfs.io/ipfs/QmEvidenceReference');
    if (uri) {
      setEscrows(escrows.map(e => e.escrowId === id ? { ...e, evidenceURI: uri } : e));
    }
  };

  const handleRaiseDispute = (id: string) => {
    setEscrows(escrows.map(e => e.escrowId === id ? { ...e, state: 'DISPUTED' } : e));
    setSelectedEscrowId(id);
    setActiveTab('DISPUTES');
  };

  const handleSendToGenLayer = (
    id: string, 
    claimant: string, 
    respondent: string, 
    evidenceURI: string
  ) => {
    // Simulating GenLayer Bradbury Adjudication Result
    let simulatedVerdict: VerdictCode = 1;
    if (claimant.toLowerCase().includes('breach') || claimant.toLowerCase().includes('fake')) {
      simulatedVerdict = 2;
    }

    setEscrows(escrows.map(e => e.escrowId === id ? {
      ...e,
      state: 'ADJUDICATION_PENDING',
      verdictCode: simulatedVerdict,
      reasoningSummary: simulatedVerdict === 1 
        ? 'Beneficiary completed tasks adhering strictly to agreement specification.'
        : 'Claimant evidence demonstrated failure to meet delivery criteria.',
      claimantStatement: claimant,
      respondentStatement: respondent,
      evidenceURI
    } : e));

    setSelectedEscrowId(id);
  };

  const handleConfirmSettlement = (id: string) => {
    const esc = escrows.find(e => e.escrowId === id);
    if (!esc) return;

    let finalState: EscrowItem['state'] = 'RELEASED';
    if (esc.verdictCode === 2) finalState = 'REFUNDED';
    if (esc.verdictCode === 3) finalState = 'UNDETERMINED_RESOLVED';

    setEscrows(escrows.map(e => e.escrowId === id ? { ...e, state: finalState } : e));
  };

  const activeDisputeEscrow = escrows.find(e => e.escrowId === selectedEscrowId) || escrows.find(e => e.state === 'DISPUTED' || e.state === 'ADJUDICATION_PENDING');

  return (
    <div className="container">
      {/* Header */}
      <header className="app-header">
        <div>
          <div className="brand-title">
            <Layers size={28} />
            <span>PAYGRIX × GENLAYER</span>
          </div>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            Intelligent Escrow & Dispute Adjudication Engine
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <span className="network-badge badge-base">Base Sepolia (Settlement)</span>
          <span className="network-badge badge-genlayer">GenLayer Bradbury (Adjudication)</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="tabs-nav">
        <button className={`tab-btn ${activeTab === 'ESCROWS' ? 'active' : ''}`} onClick={() => setActiveTab('ESCROWS')}>
          <ShieldCheck size={14} style={{ display: 'inline', marginRight: '6px' }} /> Escrow Agreements ({escrows.length})
        </button>
        <button className={`tab-btn ${activeTab === 'CREATE' ? 'active' : ''}`} onClick={() => setActiveTab('CREATE')}>
          <PlusCircle size={14} style={{ display: 'inline', marginRight: '6px' }} /> Create Escrow
        </button>
        <button className={`tab-btn ${activeTab === 'DISPUTES' ? 'active' : ''}`} onClick={() => setActiveTab('DISPUTES')}>
          <Cpu size={14} style={{ display: 'inline', marginRight: '6px' }} /> GenLayer Dispute Room
        </button>
        <button className={`tab-btn ${activeTab === 'HISTORY' ? 'active' : ''}`} onClick={() => setActiveTab('HISTORY')}>
          <History size={14} style={{ display: 'inline', marginRight: '6px' }} /> Transaction History
        </button>
      </div>

      {/* Content */}
      {activeTab === 'CREATE' && (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <EscrowForm onCreateEscrow={handleCreateEscrow} />
        </div>
      )}

      {activeTab === 'ESCROWS' && (
        <div className="grid-2">
          {escrows.map((escrow) => (
            <EscrowCard 
              key={escrow.escrowId}
              escrow={escrow}
              onFund={handleFund}
              onSubmitEvidence={handleSubmitEvidence}
              onRaiseDispute={handleRaiseDispute}
              onAdjudicate={(id) => { setSelectedEscrowId(id); setActiveTab('DISPUTES'); }}
              onSettle={(id) => { setSelectedEscrowId(id); setActiveTab('DISPUTES'); }}
            />
          ))}
        </div>
      )}

      {activeTab === 'DISPUTES' && (
        <div className="grid-2">
          {activeDisputeEscrow ? (
            <>
              <DisputePanel 
                escrow={activeDisputeEscrow} 
                onSendToGenLayer={handleSendToGenLayer} 
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <EscrowCard 
                  escrow={activeDisputeEscrow}
                  onFund={handleFund}
                  onSubmitEvidence={handleSubmitEvidence}
                  onRaiseDispute={handleRaiseDispute}
                  onAdjudicate={(id) => setSelectedEscrowId(id)}
                  onSettle={handleConfirmSettlement}
                />
                {activeDisputeEscrow.verdictCode && (
                  <VerdictViewer 
                    escrow={activeDisputeEscrow} 
                    onConfirmSettlement={handleConfirmSettlement} 
                  />
                )}
              </div>
            </>
          ) : (
            <div className="glass-panel" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px' }}>
              <CheckCircle2 size={36} color="#10b981" style={{ margin: '0 auto 16px auto' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 600 }}>No Active Disputes Pending</h3>
              <p style={{ fontSize: '14px', color: '#94a3b8', marginTop: '8px' }}>
                Raise a dispute on any funded escrow to trigger GenLayer Bradbury AI Adjudication.
              </p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'HISTORY' && (
        <div className="glass-panel">
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '20px' }}>Local Transaction History</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '12px' }}>Type</th>
                <th style={{ padding: '12px' }}>Network</th>
                <th style={{ padding: '12px' }}>TX Hash</th>
                <th style={{ padding: '12px' }}>Description</th>
                <th style={{ padding: '12px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {txHistory.map(tx => (
                <tr key={tx.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '12px', fontWeight: 600 }}>{tx.type}</td>
                  <td style={{ padding: '12px' }}>
                    <span className={`network-badge ${tx.network === 'BASE_SEPOLIA' ? 'badge-base' : 'badge-genlayer'}`}>
                      {tx.network}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', color: '#94a3b8' }}>{tx.txHash}</td>
                  <td style={{ padding: '12px' }}>{tx.description}</td>
                  <td style={{ padding: '12px', color: '#34d399', fontWeight: 600 }}>{tx.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
