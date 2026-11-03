# FinTax Consulting Platform 🏛️

Enterprise Tax Advisory & Accounting SaaS Platform with Multi-Role Portals, Local AI Processing, and Cross-Platform Mobile App. Built strictly compliant with German GoBD and DSGVO (GDPR) regulations.

---

## 🚀 Key Modules & Architecture

### 1. Central Backend Engine (`/backend`)
- **Runtime:** Node.js, Express, TypeScript
- **Database:** PostgreSQL 17 (Automated audit logs, soft deletion, role-based access)
- **AI Processing:** 
  - **Local On-Premise AI:** Ollama Vision Models (Moondream, LLaMA 3.2 Vision) running on local NVIDIA GPUs.
  - **Cloud AI (Fallback):** Google Gemini 1.5/2.0 Flash for multi-page documents and correspondence.
- **Export Formats:** Agenda SKR03 CSV format, Excel, and GoBD audit trail records.
- **Security:** SHA-256 checksums, automated duplicate detection, 30-day daily / 12-month retention management.

### 2. Web Portal (`/frontend`)
- **Technology:** React 18, Vite, TypeScript
- **Design System:** Professional White Background + Sapphire/Cobalt Blue Theme, Responsive Left Collapsible Sidebar, Toast/Snackbar alerts.
- **Portals:**
  - **Client Portal:** Uploads to 4 folders (`00_Gründung`, `01_FiBu`, `02_LoBu`, `00_Schriftverkehr`), missing document notifications, recurring checklists.
  - **Staff Dashboard:** Human-in-the-loop review, split-screen PDF verification, status badges, Agenda CSV exports.
  - **Admin Control Center:** User & client account creation, two-admin deletion approval, audit trail explorer.

### 3. Mobile App (`/fintex_app`)
- **Framework:** Flutter (Android & iOS)
- **Architecture:** Feature-driven Clean Architecture (`features/`, `core/`, `models/`, `services/`)
- **Features:**
  - **Camera Scanner:** Automatic edge detection with multi-page capture up to 200 pages.
  - **WhatsApp Import:** Direct one-tap import of photos and PDFs from WhatsApp chats into target FinTax folders.
  - **LoBu / Payroll:** Guided 3-step employer wizard for new employee onboarding, sick leave notes, and timesheets.
  - **Bilingual:** Full dynamic English (default) and German language switching.

---

## 🛠️ Quick Start

### 1. Backend Setup
```bash
cd backend
npm install
# Configure .env based on .env.example
npm run build
npm start
```

### 2. Frontend Web Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Flutter Mobile App
```bash
cd fintex_app
flutter pub get
flutter run
```

---

## 🔒 Compliance & Standards
- **GoBD-konform:** Immutable audit logs, automated file versioning, checksum validation.
- **DSGVO / GDPR:** Data encrypted at rest and in transit, hosted on German server infrastructure.
- **Agenda Accounting:** Direct export into SKR03 format for standard German tax filing.
