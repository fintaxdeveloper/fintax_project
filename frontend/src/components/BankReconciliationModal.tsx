import React from 'react';
import { X, CheckCircle2, AlertTriangle, ArrowDownRight, ArrowUpRight, ShieldCheck } from 'lucide-react';
import type { Language } from '../translations';

export interface BankTransactionRow {
  id?: string;
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  running_balance: number | null;
  calculated_balance?: number;
  is_valid_balance?: boolean;
}

export interface BankStatementItem {
  id: string;
  document_id: string;
  account_number: string;
  statement_period: string;
  opening_balance: number;
  closing_balance: number;
  total_debits?: number;
  total_credits?: number;
  is_reconciled?: boolean;
  reconciliation_error?: string;
  transactions?: BankTransactionRow[];
}

interface BankReconciliationModalProps {
  lang: Language;
  statement: BankStatementItem;
  onClose: () => void;
}

export const BankReconciliationModal: React.FC<BankReconciliationModalProps> = ({
  lang,
  statement,
  onClose,
}) => {
  const opening = Number(statement.opening_balance) || 0;
  const closing = Number(statement.closing_balance) || 0;
  const debits = Number(statement.total_debits) || 0;
  const credits = Number(statement.total_credits) || 0;
  const calculatedClosing = Math.round((opening - debits + credits) * 100) / 100;
  const isMatch = Math.abs(calculatedClosing - closing) < 0.05;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1.5rem',
    }}>
      <div style={{
        background: '#0d1322',
        border: '1px solid #1e293b',
        borderRadius: '1.25rem',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        width: '100%',
        maxWidth: '1100px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#f8fafc',
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.75rem',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🏦</span>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0 }}>
                {lang === 'de' ? 'Kontoauszug-Abstimmung (PDF Seite 8)' : 'Bank Statement Reconciliation (PDF Page 8)'}
              </h2>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Konto: <strong style={{ color: '#60a5fa' }}>{statement.account_number}</strong> • Zeitraum: <strong>{statement.statement_period}</strong>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Mathematical Reconciliation Summary Banner */}
        <div style={{ padding: '1.25rem 1.75rem', background: '#090d16', borderBottom: '1px solid #1e293b' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem',
          }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '0.6875rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                {lang === 'de' ? 'Anfangssaldo (Opening)' : 'Opening Balance'}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
                {opening.toFixed(2)} €
              </div>
            </div>

            <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div style={{ fontSize: '0.6875rem', color: '#f87171', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <ArrowDownRight size={14} /> {lang === 'de' ? 'Gesamt Soll (Debits -)' : 'Total Debits (-)'}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f87171' }}>
                - {debits.toFixed(2)} €
              </div>
            </div>

            <div style={{ background: 'rgba(34, 197, 94, 0.08)', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              <div style={{ fontSize: '0.6875rem', color: '#4ade80', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <ArrowUpRight size={14} /> {lang === 'de' ? 'Gesamt Haben (Credits +)' : 'Total Credits (+)'}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#4ade80' }}>
                + {credits.toFixed(2)} €
              </div>
            </div>

            <div style={{ background: 'rgba(2, 132, 199, 0.08)', padding: '0.75rem 1rem', borderRadius: '0.5rem', border: '1px solid rgba(2, 132, 199, 0.2)' }}>
              <div style={{ fontSize: '0.6875rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700 }}>
                {lang === 'de' ? 'Endsaldo (Closing)' : 'Reported Closing'}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8' }}>
                {closing.toFixed(2)} €
              </div>
            </div>
          </div>

          {/* Running Balance Equation Check */}
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            background: isMatch ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${isMatch ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.8125rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isMatch ? <CheckCircle2 size={18} color="#22c55e" /> : <AlertTriangle size={18} color="#ef4444" />}
              <span style={{ fontWeight: 600, color: isMatch ? '#4ade80' : '#f87171' }}>
                {isMatch
                  ? (lang === 'de' ? 'Fortlaufende Saldenprüfung bestanden: Anfangssaldo - Ausgaben + Einnahmen = Endsaldo' : 'Running balance verified: Opening balance - debits + credits matches reported closing')
                  : (lang === 'de' ? `Differenz festgestellt: Errechnet ${calculatedClosing.toFixed(2)} €, aber Bank meldet ${closing.toFixed(2)} €` : `Discrepancy: Calculated ${calculatedClosing.toFixed(2)} €, reported ${closing.toFixed(2)} €`)}
              </span>
            </div>
            <span style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '9999px',
              fontSize: '0.6875rem',
              fontWeight: 800,
              background: isMatch ? '#15803d' : '#b91c1c',
              color: '#ffffff',
            }}>
              {isMatch ? '✓ RECONCILED' : '⚠️ MISMATCH ALERT'}
            </span>
          </div>
        </div>

        {/* Tabular Transaction Rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.75rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0 0 0.75rem 0', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {lang === 'de' ? 'Extrahierte Buchungszeilen (Transactions)' : 'Extracted Bank Transaction Rows'}
          </h3>

          <div style={{ border: '1px solid #1e293b', borderRadius: '0.5rem', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.6875rem' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>{lang === 'de' ? 'Datum' : 'Date'}</th>
                  <th style={{ padding: '0.75rem 1rem' }}>{lang === 'de' ? 'Buchungstext / Verwendungszweck' : 'Description'}</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{lang === 'de' ? 'Soll (Debit -)' : 'Debit (-)'}</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{lang === 'de' ? 'Haben (Credit +)' : 'Credit (+)'}</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{lang === 'de' ? 'Saldo (Balance)' : 'Running Balance'}</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{lang === 'de' ? 'Prüfung' : 'Check'}</th>
                </tr>
              </thead>
              <tbody>
                {statement.transactions && statement.transactions.length > 0 ? (
                  statement.transactions.map((tx, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap' }}>
                        {tx.date}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                        {tx.description}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: tx.debit ? '#f87171' : '#64748b' }}>
                        {tx.debit ? `- ${Number(tx.debit).toFixed(2)} €` : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: tx.credit ? '#4ade80' : '#64748b' }}>
                        {tx.credit ? `+ ${Number(tx.credit).toFixed(2)} €` : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: '#38bdf8' }}>
                        {tx.running_balance !== null ? `${Number(tx.running_balance).toFixed(2)} €` : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                        {tx.is_valid_balance !== false ? (
                          <span style={{ color: '#22c55e', fontSize: '0.75rem', fontWeight: 700 }}>✓ OK</span>
                        ) : (
                          <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 700 }}>⚠️ MISMATCH</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                      {lang === 'de' ? 'Keine Buchungen vorhanden' : 'No transactions recorded'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '1rem 1.75rem',
          borderTop: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            🔒 {lang === 'de' ? 'Revisionssicher in PostgreSQL gespeichert' : 'Stored with audit trail in PostgreSQL'}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid #334155',
                color: '#cbd5e1',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {lang === 'de' ? 'Schließen' : 'Close'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 1.25rem',
                borderRadius: '0.5rem',
                fontSize: '0.8125rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
            >
              <ShieldCheck size={16} />
              <span>{lang === 'de' ? 'Abstimmung bestätigen' : 'Confirm Reconciliation'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
