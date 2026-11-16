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
    {
      title: 'OCR & Layout-Erkennung',
      desc: 'Hochauflösende Texterkennung, Tabellen-Layout & Beträge werden aus Beleg extrahiert...',
      telemetry: 'OCR Stream aktiv: 1.480 Tokens verarbeitet • Tabellenstruktur & Beträge erkannt',
      badge: '01 / OCR SCAN',
      chip1: '⚡ 300 DPI SCAN',
      chip2: '📄 PDF / BILD OK',
    },
    {
      title: 'Ollama Qwen AI Intelligenz-Engine',
      desc: 'Analysiere Buchungstext, §25a Differenzbesteuerung & SKR03-Kontenzuordnung...',
      telemetry: 'Qwen 2.5 aktiv: Prüfe Buchungstext, §25a UStG Historie & DATEV BU-Code',
      badge: '02 / AI AUDIT',
      chip1: '🧠 QWEN 2.5 ENGINE',
      chip2: '🛡️ §25a AUTO-CHECK',
    },
    {
      title: 'Bank- & Kassen-Abgleich',
      desc: 'Automatische Abstimmung von Bank 1200, Kasse 1000 & Geldtransit 1360 = 0,00 €...',
      telemetry: '3-Track Abgleich: Bank 1200 vs. Kasse 1000 • Geldtransit 1360 Saldo verifiziert',
      badge: '03 / ABGLEICH',
      chip1: '🏦 BANK 1200 MATCH',
      chip2: '⚖️ 1360 TRANSIT = 0',
    },
    {
      title: 'DATEV EXTF & Sicherheits-Gate',
      desc: 'Prüfe VIN-Register, Dubletten-Schutz und schalte DATEV Buchungsstapel frei...',
      telemetry: 'DATEV Review Gate: Erstelle Buchungsstapel, Personen- & Sachkonten CSV...',
      badge: '04 / DATEV GATE',
      chip1: '📋 EXTF 700 FORMAT',
      chip2: '✅ GO-BD KONFORM',
    },
  ];

  const stepsEn = [
    {
      title: 'OCR & Layout Parsing',
      desc: 'High-resolution text recognition, document layout & amounts being extracted...',
      telemetry: 'OCR stream active: 1,480 tokens parsed • document tables & amounts captured',
      badge: '01 / OCR SCAN',
      chip1: '⚡ 300 DPI SCAN',
      chip2: '📄 PDF / IMAGE OK',
    },
    {
      title: 'Ollama Qwen AI Intelligence Engine',
      desc: 'Analyzing transaction text, §25a margin-scheme rules & SKR03 accounts...',
      telemetry: 'Qwen 2.5 active: Checking description, §25a VIN history & DATEV BU codes',
      badge: '02 / AI AUDIT',
      chip1: '🧠 QWEN 2.5 ENGINE',
      chip2: '🛡️ §25a AUTO-CHECK',
    },
    {
      title: 'Bank & Cash Reconciliation',
      desc: 'Cross-validating Bank 1200, Cash 1000 & Transit 1360 balance = 0.00 €...',
      telemetry: '3-Track Engine: Reconciling Bank 1200 vs Cash 1000 • Transit 1360 confirmed',
      badge: '03 / RECONCILE',
      chip1: '🏦 BANK 1200 MATCH',
      chip2: '⚖️ 1360 TRANSIT = 0',
    },
    {
      title: 'DATEV EXTF & Security Gate',
      desc: 'Verifying VIN register, duplicate guards & unlocking DATEV export batch...',
      telemetry: 'DATEV Review Gate: Compiling Buchungsstapel, Personenkonten & Sachkonten CSV...',
      badge: '04 / DATEV GATE',
      chip1: '📋 EXTF 700 FORMAT',
      chip2: '✅ GO-BD COMPLIANT',
    },
  ];

  const steps = isDe ? stepsDe : stepsEn;

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % steps.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [steps.length]);

  const current = steps[stepIndex];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(10, 25, 47, 0.92) 0%, rgba(4, 10, 20, 0.98) 100%)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        zIndex: 2500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 0.25s ease-out',
      }}
    >
      {/* Outer Cyber Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'linear-gradient(175deg, rgba(15, 30, 56, 0.95) 0%, rgba(7, 16, 32, 0.98) 100%)',
          borderRadius: 24,
          border: '1.5px solid rgba(56, 189, 248, 0.35)',
          boxShadow:
            '0 30px 80px -15px rgba(0, 0, 0, 0.9), 0 0 60px -10px rgba(14, 165, 233, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
          padding: '36px 32px 30px',
          color: '#ffffff',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Ambient Top Glow Orbs */}
        <div
          style={{
            position: 'absolute',
            top: -80,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 320,
            height: 180,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(56, 189, 248, 0.3) 0%, rgba(16, 185, 129, 0.15) 50%, transparent 70%)',
            pointerEvents: 'none',
            filter: 'blur(30px)',
          }}
        />

        {/* ── Holographic 3D Document Scanner Cradle ── */}
        <div
          style={{
            position: 'relative',
            width: 220,
            height: 200,
            margin: '0 auto 26px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Rotating Outer Radar Ring */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '1px dashed rgba(56, 189, 248, 0.35)',
              animation: 'aiGlowRing 16s linear infinite',
              pointerEvents: 'none',
            }}
          />

          {/* Rotating Inner Radar Ring */}
          <div
            style={{
              position: 'absolute',
              inset: 20,
              borderRadius: '50%',
              border: '1px dotted rgba(16, 185, 129, 0.4)',
              animation: 'aiGlowRingReverse 12s linear infinite',
              pointerEvents: 'none',
            }}
          />

          {/* Cybernetic HUD Corner Brackets */}
          <div style={{ position: 'absolute', top: 12, left: 24, width: 14, height: 14, borderTop: '2px solid #38bdf8', borderLeft: '2px solid #38bdf8', zIndex: 4 }} />
          <div style={{ position: 'absolute', top: 12, right: 24, width: 14, height: 14, borderTop: '2px solid #38bdf8', borderRight: '2px solid #38bdf8', zIndex: 4 }} />
          <div style={{ position: 'absolute', bottom: 12, left: 24, width: 14, height: 14, borderBottom: '2px solid #38bdf8', borderLeft: '2px solid #38bdf8', zIndex: 4 }} />
          <div style={{ position: 'absolute', bottom: 12, right: 24, width: 14, height: 14, borderBottom: '2px solid #38bdf8', borderRight: '2px solid #38bdf8', zIndex: 4 }} />

          {/* Floating Live Telemetry Chip Left */}
          <div
            style={{
              position: 'absolute',
              left: -12,
              top: '22%',
              background: 'rgba(15, 23, 42, 0.92)',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: '0.66rem',
              fontWeight: 800,
              color: '#38bdf8',
              letterSpacing: '0.05em',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4), 0 0 10px rgba(56, 189, 248, 0.25)',
              zIndex: 5,
              animation: 'aiCardFloat 3s ease-in-out infinite',
              whiteSpace: 'nowrap',
            }}
          >
            {current.chip1}
          </div>

          {/* Floating Live Telemetry Chip Right */}
          <div
            style={{
              position: 'absolute',
              right: -12,
              bottom: '22%',
              background: 'rgba(15, 23, 42, 0.92)',
              border: '1px solid rgba(16, 185, 129, 0.5)',
              borderRadius: 6,
              padding: '3px 8px',
              fontSize: '0.66rem',
              fontWeight: 800,
              color: '#10b981',
              letterSpacing: '0.05em',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4), 0 0 10px rgba(16, 185, 129, 0.25)',
              zIndex: 5,
              animation: 'aiCardFloat 3s ease-in-out infinite 1.5s',
              whiteSpace: 'nowrap',
            }}
          >
            {current.chip2}
          </div>

          {/* Document Glass Card */}
          <div
            style={{
              width: 126,
              height: 160,
              background: 'linear-gradient(160deg, rgba(30, 48, 77, 0.92) 0%, rgba(13, 24, 43, 0.98) 100%)',
              borderRadius: 14,
              border: '1.5px solid rgba(56, 189, 248, 0.45)',
              boxShadow: '0 16px 36px rgba(0, 0, 0, 0.6), 0 0 30px rgba(14, 165, 233, 0.25)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: 12,
              zIndex: 3,
            }}
          >
            {/* Moving Holographic Scanning Grid Overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage:
                  'linear-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.08) 1px, transparent 1px)',
                backgroundSize: '16px 16px',
                animation: 'aiHoloGrid 4s linear infinite',
                pointerEvents: 'none',
              }}
            />

            {/* Glowing Dual Laser Scanner Beam */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: 3,
                background: 'linear-gradient(90deg, transparent 0%, #38bdf8 20%, #ffffff 50%, #10b981 80%, transparent 100%)',
                boxShadow:
                  '0 0 16px 4px rgba(56, 189, 248, 0.9), 0 0 30px 8px rgba(16, 185, 129, 0.6), 0 0 45px 12px rgba(56, 189, 248, 0.35)',
                animation: 'aiScanLaser 2.2s ease-in-out infinite, aiLaserGlowWave 2.2s ease-in-out infinite',
                zIndex: 10,
              }}
            />

            {/* Document Header with Logo Watermark */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: '0.9rem' }}>📄</span>
                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.05em' }}>DATEV</span>
              </div>
              <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '1px 5px', borderRadius: 4 }}>
                SKR03
              </span>
            </div>

            {/* Simulated Document Table Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%', margin: '6px 0' }}>
              <div style={{ width: '85%', height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.35)' }} />
              <div style={{ width: '65%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
              <div style={{ width: '92%', height: 4, borderRadius: 2, background: 'rgba(56, 189, 248, 0.35)' }} />
              <div style={{ width: '50%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
              <div style={{ width: '75%', height: 5, borderRadius: 3, background: 'rgba(16, 185, 129, 0.4)' }} />
            </div>

            {/* Document Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 5 }}>
              <span style={{ fontSize: '0.55rem', color: '#64748b', fontFamily: 'monospace' }}>§25a UStG</span>
              <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>EUR</span>
            </div>
          </div>
        </div>

        {/* ── Engine Badge with Pulsing Core ── */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 999,
            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(16, 185, 129, 0.12) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.45)',
            boxShadow: '0 0 20px rgba(56, 189, 248, 0.2)',
            marginBottom: 16,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 10px #10b981',
              animation: 'aiNeuralPulse 1.6s infinite',
            }}
          />
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            OLLAMA QWEN 2.5 • GPU ACCELERATED
          </span>
        </div>

        {/* ── Main Dynamic Step Title ── */}
        <h3
          key={stepIndex}
          style={{
            margin: '0 0 8px 0',
            fontSize: '1.38rem',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.02em',
            textShadow: '0 2px 14px rgba(56, 189, 248, 0.4)',
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          {current.title}
        </h3>

        {/* ── Description ── */}
        <p
          key={`desc-${stepIndex}`}
          style={{
            margin: '0 auto 16px',
            maxWidth: 420,
            fontSize: '0.9rem',
            color: '#94a3b8',
            minHeight: 42,
            lineHeight: 1.5,
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          {current.desc}
        </p>

        {/* ── Live Cyber Telemetry Ticker ── */}
        <div
          style={{
            background: 'rgba(5, 12, 24, 0.85)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: 8,
            padding: '7px 12px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textAlign: 'left',
          }}
        >
          <span style={{ color: '#10b981', fontSize: '0.78rem', fontWeight: 800, fontFamily: 'monospace' }}>❯</span>
          <span
            key={`tel-${stepIndex}`}
            style={{
              fontSize: '0.74rem',
              color: '#38bdf8',
              fontFamily: 'monospace',
              letterSpacing: '0.02em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              animation: 'fadeIn 0.25s ease-out',
            }}
          >
            {current.telemetry}
          </span>
          <span style={{ color: '#38bdf8', fontSize: '0.74rem', fontWeight: 700, animation: 'aiCyberBlink 1s infinite' }}>_</span>
        </div>

        {/* ── 4 Segmented Progress HUD Nodes ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
          {steps.map((_, idx) => {
            const isActive = idx === stepIndex;
            const isCompleted = idx < stepIndex;
            return (
              <div
                key={idx}
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(16, 185, 129, 0.15))'
                    : isCompleted
                    ? 'rgba(16, 185, 129, 0.12)'
                    : 'rgba(255, 255, 255, 0.04)',
                  border: isActive
                    ? '1.5px solid #38bdf8'
                    : isCompleted
                    ? '1px solid rgba(16, 185, 129, 0.45)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  padding: '7px 6px',
                  boxShadow: isActive ? '0 0 16px rgba(56, 189, 248, 0.35)' : 'none',
                  transition: 'all 0.35s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span
                    style={{
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      fontFamily: 'monospace',
                      color: isActive ? '#38bdf8' : isCompleted ? '#10b981' : '#64748b',
                    }}
                  >
                    {isCompleted ? '✓' : `0${idx + 1}`}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '0.64rem',
                    fontWeight: 700,
                    color: isActive ? '#ffffff' : isCompleted ? '#cbd5e1' : '#64748b',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%',
                  }}
                >
                  {idx === 0
                    ? 'OCR Scan'
                    : idx === 1
                    ? 'Qwen AI'
                    : idx === 2
                    ? isDe ? 'Abgleich' : 'Reconcile'
                    : 'DATEV'}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Document Pill at Bottom ── */}
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(15, 23, 42, 0.9) 0%, rgba(8, 17, 34, 0.95) 100%)',
            borderRadius: 12,
            padding: '10px 14px',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', flex: 1, textAlign: 'left' }}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>📎</span>
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#e2e8f0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={filename}
            >
              {filename}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span
              style={{
                color: '#38bdf8',
                fontWeight: 700,
                fontSize: '0.72rem',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '2px 8px',
                borderRadius: 6,
                letterSpacing: '0.04em',
              }}
            >
              {category}
            </span>
            <span
              style={{
                color: '#10b981',
                fontWeight: 800,
                fontSize: '0.7rem',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '2px 8px',
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', animation: 'aiNeuralPulse 1.2s infinite' }} />
              Live
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
