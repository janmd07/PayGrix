import React, { useState } from 'react';
import { Cpu, Scale, AlertTriangle, Send } from 'lucide-react';
import { EscrowItem } from '../types/escrow';

interface DisputePanelProps {
  escrow: EscrowItem;
  onSendToGenLayer: (
    escrowId: string,
    claimantStatement: string,
    respondentStatement: string,
    evidenceURI: string
  ) => void;
}

export const DisputePanel: React.FC<DisputePanelProps> = ({ escrow, onSendToGenLayer }) => {
  const [claimantStatement, setClaimantStatement] = useState(
    'Deliverable failed to meet specified acceptance criteria in contract agreement.'
  );
  const [respondentStatement, setRespondentStatement] = useState(
    'Work completed according to repository specification and passed tests.'
  );
  const [evidenceURI, setEvidenceURI] = useState(
    escrow.evidenceURI || 'https://ipfs.io/ipfs/QmPayGrixDisputeEvidenceReference'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSendToGenLayer(escrow.escrowId, claimantStatement, respondentStatement, evidenceURI);
  };

  return (
    <div className="glass-panel" style={{ border: '1px solid rgba(168, 85, 247, 0.4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Cpu size={24} color="#c084fc" />
          <h2 style={{ fontSize: '18px', fontWeight: 700 }}>GenLayer Bradbury Intelligent Adjudication</h2>
        </div>
        <span className="network-badge badge-genlayer">GenLayer Bradbury</span>
      </div>

      <div style={{ padding: '12px', background: 'rgba(168, 85, 247, 0.08)', borderRadius: '8px', border: '1px solid rgba(168, 85, 247, 0.2)', marginBottom: '20px', fontSize: '13px', color: '#e9d5ff' }}>
        <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
        <span>GenLayer non-deterministic LLM evaluation will reach validator consensus on a structured verdict code.</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Claimant Statement (Depositor / Buyer)</label>
          <textarea 
            className="form-textarea" 
            rows={3} 
            value={claimantStatement} 
            onChange={(e) => setClaimantStatement(e.target.value)} 
            required 
          />
        </div>

        <div className="form-group">
          <label className="form-label">Respondent Statement (Beneficiary / Provider)</label>
          <textarea 
            className="form-textarea" 
            rows={3} 
            value={respondentStatement} 
            onChange={(e) => setRespondentStatement(e.target.value)} 
            required 
          />
        </div>

        <div className="form-group">
          <label className="form-label">IPFS Evidence Reference URI</label>
          <input 
            type="text" 
            className="form-input form-mono" 
            value={evidenceURI} 
            onChange={(e) => setEvidenceURI(e.target.value)} 
            required 
          />
        </div>

        <button type="submit" className="btn btn-primary" style={{ width: '100%', background: 'linear-gradient(135deg, #a855f7, #06b6d4)' }}>
          <Send size={16} /> Submit Dispute to GenLayer Consensus
        </button>
      </form>
    </div>
  );
};
