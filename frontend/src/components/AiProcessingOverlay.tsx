import React, { useEffect, useState } from 'react';

interface AiProcessingOverlayProps {
  filename?: string;
  category?: string;
  isDe?: boolean;
}

export const AiProcessingOverlay: React.FC<AiProcessingOverlayProps> = ({
  filename = 'Dokument.pdf',
  category = '01_FiBu',
  isDe = true,
}) => {
  const [stepIndex, setStepIndex] = useState(0);

  const stepsDe = [
    { title: 'OCR & Layout-Erkennung', desc: 'Text, Belegdatum & Beträge werden aus PDF extrahiert...' },
    { title: 'Ollama Qwen 3.5 Prüf-Engine', desc: 'Prüfe Buchungstext, §25a UStG & SKR03-Kontenzuordnung...' },
    { title: 'Bank- & Kassen-Abgleich', desc: 'Verifiziere Bank 1200, Kasse 1000 & Geldtransit 1360...' },
    { title: 'Sicherheits- & Dubletten-Check', desc: 'Prüfe VIN-Historie und erstelle DATEV-Prüfbericht...' },
  ];

  const stepsEn = [
    { title: 'OCR & Layout Parsing', desc: 'Extracting text, invoice dates & amounts from document...' },
    { title: 'Ollama Qwen 3.5 Engine', desc: 'Analyzing transaction text, §25a rules & SKR03 accounts...' },
    { title: 'Bank & Cash Reconciliation', desc: 'Cross-validating Bank 1200, Cash 1000 & Transit 1360...' },
    { title: 'Audit & Duplicate Checks', desc: 'Verifying VIN history & compiling DATEV Review Gate...' },
  ];

  const steps = isDe ? stepsDe : stepsEn;

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % steps.length);
    }, 2400);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(11, 26, 48, 0.85)',
        backdropFilter: 'blur(10px)',
        zIndex: 2500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'linear-gradient(145deg, #0f223d, #0b1a30)',
          borderRadius: 20,
          border: '1px solid rgba(14, 165, 233, 0.35)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 40px rgba(14, 165, 233, 0.25)',
          padding: '32px 28px',
          color: '#ffffff',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Animated Background Glow */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            right: -60,
            width: 180,
            height: 180,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(14, 165, 233, 0.25), transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Holographic Document Scanner Card */}
        <div
          style={{
            width: 140,
            height: 170,
            margin: '0 auto 24px',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))',
            borderRadius: 14,
            border: '1.5px solid rgba(56, 189, 248, 0.4)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 12,
          }}
        >
          {/* Laser beam */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              height: 3,
              background: 'linear-gradient(90deg, transparent, #38bdf8, #10b981, #38bdf8, transparent)',
              boxShadow: '0 0 12px 3px rgba(56, 189, 248, 0.8), 0 0 20px 6px rgba(16, 185, 129, 0.4)',
              animation: 'aiScanLaser 2.2s ease-in-out infinite',
              zIndex: 3,
            }}
          />

          {/* Simulated document lines */}
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
            <span style={{ fontSize: 24 }}>📄</span>
          </div>
          <div style={{ width: '80%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.25)', marginBottom: 6 }} />
          <div style={{ width: '60%', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.18)', marginBottom: 6 }} />
          <div style={{ width: '70%', height: 6, borderRadius: 3, background: 'rgba(56, 189, 248, 0.4)', marginBottom: 6 }} />
          <div style={{ width: '45%', height: 6, borderRadius: 3, background: 'rgba(16, 185, 129, 0.4)' }} />
        </div>

        {/* AI Processing Title with Pulse Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 12px', borderRadius: 999, background: 'rgba(14, 165, 233, 0.15)', border: '1px solid rgba(14, 165, 233, 0.4)', marginBottom: 14 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#38bdf8',
              animation: 'aiNeuralPulse 1.6s infinite',
            }}
          />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Ollama Qwen AI Engine
          </span>
        </div>

        <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>
          {steps[stepIndex].title}
        </h3>

        <p style={{ margin: '0 0 18px 0', fontSize: '0.9rem', color: '#94a3b8', minHeight: 40, lineHeight: 1.45 }}>
          {steps[stepIndex].desc}
        </p>

        {/* Progress Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
          {steps.map((_, idx) => (
            <div
              key={idx}
              style={{
                width: idx === stepIndex ? 22 : 6,
                height: 6,
                borderRadius: 3,
                background: idx === stepIndex ? '#38bdf8' : 'rgba(255,255,255,0.2)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Current Document Pill */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            borderRadius: 10,
            padding: '10px 14px',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.82rem',
            color: '#cbd5e1',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%', textAlign: 'left' }}>
            📎 {filename}
          </span>
          <span style={{ color: '#38bdf8', fontWeight: 600, fontSize: '0.75rem', background: 'rgba(56,189,248,0.1)', padding: '2px 8px', borderRadius: 6 }}>
            {category}
          </span>
        </div>
      </div>
    </div>
  );
};
