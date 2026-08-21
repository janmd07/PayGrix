import React, { useState } from 'react';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import { EscrowItem } from '../types/escrow';

interface EscrowFormProps {
  onCreateEscrow: (escrow: Omit<EscrowItem, 'escrowId' | 'createdAt' | 'adjudicationNonce'>) => void;
}

export const EscrowForm: React.FC<EscrowFormProps> = ({ onCreateEscrow }) => {
  const [depositor, setDepositor] = useState('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');
  const [beneficiary, setBeneficiary] = useState('0x1234567890abcdef1234567890abcdef12345678');
  const [amount, setAmount] = useState('500');
  const [durationDays, setDurationDays] = useState('7');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawAmt = parseFloat(amount) || 0;
    const durSec = (parseInt(durationDays) || 7) * 86400;

    onCreateEscrow({
      depositor,
      beneficiary,
      amount: rawAmt.toLocaleString('en-US', { minimumFractionDigits: 2 }),
      rawAmount: rawAmt,
      expirationTimestamp: Math.floor(Date.now() / 1000) + durSec,
      state: 'CREATED'
    });
  };

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <ShieldCheck size={24} color="#60a5fa" />
        <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Create Base Sepolia Escrow</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Depositor Address (USDC Owner)</label>
          <input 
            type="text" 
            className="form-input form-mono" 
            value={depositor} 
            onChange={(e) => setDepositor(e.target.value)} 
            required 
          />
        </div>

        <div className="form-group">
          <label className="form-label">Beneficiary Address (Service Provider)</label>
          <input 
            type="text" 
            className="form-input form-mono" 
            value={beneficiary} 
            onChange={(e) => setBeneficiary(e.target.value)} 
            required 
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Escrow Amount (USDC)</label>
            <input 
              type="number" 
              className="form-input" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
              min="1"
              required 
            />
          </div>

          <div className="form-group">
            <label className="form-label">Duration (Days)</label>
            <input 
              type="number" 
              className="form-input" 
              value={durationDays} 
              onChange={(e) => setDurationDays(e.target.value)} 
              min="1"
              required 
            />
          </div>
        </div>

        <div style={{ marginTop: '20px' }}>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            <span>Create Escrow Agreement</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </div>
  );
};
