# FinTax – Code Review Report

Branch: `fix/pipeline-general` (main se banaya, abhi tak koi code change nahi hua).
Scope: backend (`backend/src`), frontend (`frontend/src`), `storage/`, scripts, aur QA24 2024 ka test data.
Line numbers 17.11.2026 ki working copy ke hain.

---

## 1. Project structure

| Folder / File | Kya karta hai |
|---|---|
| `backend/src/server.ts` | Express API (port 5000), takreeban 67 routes: auth, upload, review, export, Drive, payroll, admin. Upload ka poora flow isi file mein inline hai. |
| `backend/src/services/aiService.ts` | Sab se important file. Ollama/Gemini se document padhna (`processInvoice`), multi-bill split (`extractMultipleBills`), date resolve karna, deterministic Kontoauszug parser (`parseGermanBankStatement`) aur unknown bank lines ka Qwen classifier. |
| `services/pdfExtractor.ts` | `pdf-parse-fork` se poore PDF ka text (page-wise nahi) aur scanned PDF se embedded JPEG/PNG page images. |
| `services/exportService.ts` | DATEV EXTF CSV banata hai. Main function `generateDocumentAndMonthlySKR03Csv` mein 3 tracks hain (Bank / Belege match / Kasse), phir VIN/§25a logic, phir review gate. |
| `services/reviewService.ts` | Review gate: questions (issues), control checks, resolutions aur vendor rules (JSON files mein). |
| `services/skr03Mapper.ts` | Keyword → SKR03 account dictionary. |
| `services/supplierMemoryService.ts` | `storage/learned_suppliers.json`: supplier → account memory. |
| `services/monthlyDocumentRegistry.ts` | Hardcoded "golden answers" (City Grill 2026 demo). Desktop ke ek fixed path se CSV padhta hai. |
| `services/datevExtfTemplates.ts` | Personenkonten aur Sachkonten EXTF files, plus hardcoded August 2026 bookings. |
| `services/documentClassifier.ts` | Document type batata hai: pehle filename, phir Ollama, phir keywords. |
| `services/validationService.ts` | Checksum (SHA-256), math check, duplicate check. |
| `services/mathCrossValidationService.ts` | Net + MwSt = Brutto ko check aur correct karta hai, IBAN check bhi. |
| `services/ollamaClient.ts` | Ollama HTTP client (streaming, JSON repair). Default text model `qwen3.5:9b`, vision model `minicpm-v`. |
| `services/aiCacheService.ts` | File checksum → AI result cache (`storage/ai_extraction_cache.json`). |
| `services/bankStatementService.ts` | Purana bank parser (legacy route + fallback). Isme "Januar 2026" hardcoded hai. |
| `services/clientFolderService.ts` | Vault mein client/year/month folder structure banata hai. |
| `services/googleDriveService.ts` | Google Drive for Desktop (`G:\My Drive` waghera) mein files aur CSV copy karta hai. |
| `services/authService.ts`, `adminService.ts` | Login, JWT, OTP, users, audit (PostgreSQL ke saath JSON fallback). |
| `services/dbService.ts` | Documents ka "database": `storage/database.json` (poori file har dafa read aur write hoti hai) plus Postgres mirror. |
| `services/payroll`, `correspondence`, `deletionApproval`, `backup`, `masking` | Side features: Lohn, Schriftverkehr, delete approval, backup, data masking. |
| `backend/prisma/` | Postgres schema. |
| `backend/scratch/` | Ad-hoc scripts (gitignored). Koi asli test suite nahi hai. |
| `frontend/src/portals/ClientPortal.tsx` | Client UI (upload, documents, review gate kholna). File 4469 lines ki hai. |
| `frontend/src/portals/AdminPortal.tsx` | Admin UI (users, backups, deletion requests). |
| `frontend/src/components/ReviewGateModal.tsx` | Review questions dikhata hai, jawab bhejta hai, CSV download karwata hai. |
| `frontend/src/context/AuthContext.tsx`, `LoginModal.tsx` | Login aur OTP. |
| `fintex_app/` | Flutter mobile app (camera scan, WhatsApp import). |
| `storage/` | `database.json`, caches, review JSONs, `vault/` (PDFs, gitignored), `exports/` (gitignored). |
| `test_documents/` | Sirf ID/Handelsregister sample PDFs. |

---

## 2. PDF upload se CSV export tak ka flow

`POST /api/documents/upload` (`server.ts:338`):

1. Multer file ko `storage/vault/doc_<uuid>.pdf` par save karta hai (25 MB limit, `server.ts:51-65`).
2. `validationService.calculateChecksum` se SHA-256 banta hai (`server.ts:358`).
3. `clientFolderService.storeDocumentFile` file ko client/year/month folder mein copy karta hai, aur `dbService.create` record banata hai (`:372`, `:398`).
4. `00_Stammdaten` documents expiry check mein jaate hain. Schriftverkehr `correspondenceService` mein jaata hai (`:401`, `:474`).
5. `documentClassifier.classify` type batata hai (`:470`). Kontoauszug, Kasse ya Bankbeleg pehle filename se pehchaane jaate hain.
6. `aiCacheService.get(checksum)`: hit hone par purana result use hota hai. Warna `aiService.processInvoice` (`aiService.ts:24`) chalta hai:
   1. `pdfExtractor.extractText` se poora text.
   2. `monthlyDocumentRegistry.match` (demo shortcut).
   3. "Kontoauszug M/2026 + Sparkasse" ka shortcut.
   4. `parseGermanBankStatement` (deterministic regex parser). Uske baad `enrichUnknownBankLinesWithOllama` (sirf 4900 wali lines).
   5. Kassenbericht/Kassenbelege/Bankbelege ke hardcoded demo results (`:91-312`).
   6. Ollama Qwen: digital PDF ka text (pehle 4500 chars), scanned PDF ka **sirf pehla page** vision mein (`:395`).
   7. `sanitizeOutput`: category → SKR03, date, bookings.
   8. Kuch na mile to `heuristicFallback`.
7. Agar BANK_STATEMENT mein ≤1 booking ho to `bankStatementService.processBankStatement` fallback chalta hai (`server.ts:509`).
8. Non-bank docs ke liye `aiService.extractMultipleBills` chalta hai (`server.ts:587`): har page image vision mein jaati hai (max 25). ≥2 bills milein to sab ek hi document ke `bookings[]` mein merge ho jaate hain (`:773-827`).
9. `routeFinancialDocument` (`server.ts:605`) yeh karta hai:
   - year/month resolve
   - `validationService.validate` aur `checkDuplicates` (`:632`)
   - `exportService.generateDocumentAndMonthlySKR03Csv` (`:663`), jo yeh karta hai:
     - Is client aur month ke saare docs leta hai. Duplicates hata deta hai.
     - **Track 1 Bank:** saare Kontoauszüge merge karta hai, lines dedupe karta hai, aur 0,80 SecureGo fee ko 4970 mein split karta hai (`exportService.ts:717-794`).
     - **Track 2 Belege↔Bank:** amount ±0.05 se match karke Belegfeld1 aur account bhar deta hai (`:797-828`).
     - **Track 3 Kasse:** `konto==='1000'` wali items leta hai, kuch filters lagata hai (`:841-869`). Har 1200→1360 withdrawal ke liye auto 1000/1360 line banata hai (`:876-918`).
     - **VIN/§25a resolution:** maps aur hardcoded QA24 VINs/names (`:920-1193`).
     - **Review gate:** `applyVendorRules` → `assignLineKeys` → `applyResolutions` → `analyze` (`:1198-1221`).
     - CSV likhta hai (`storage/exports` aur client folder `00_CSV`). Gate blocked ho to CSV release nahi hota (`:1309`).
   - `googleDriveService.syncFinancialAccountingWithCsv` Drive mein copy karta hai (`:703`).
   - `dbService.update` (`:740`).
10. Frontend `ReviewGateModal` `/api/documents/:id/review-report` laata hai. User jawab `/api/review/resolve` par bhejta hai, aur export dobara chalta hai.

---

## 3. AI kahan use hota hai, aur rules/code kahan

| Kaam | AI (Ollama/Qwen) | Rules / code |
|---|---|---|
| Kontoauszug (digital) lines nikaalna | Nahi | Regex parser (`aiService.ts:1663+`) |
| Bank line ka Gegenkonto | Sirf jo line 4900 par reh jaye. Qwen category deta hai, confidence ≥ 0.8 par auto-apply (`:1550-1657`, temperature 0) | Lambi if-chain (`:1818-2107`), supplier memory, skr03Mapper |
| Scanned Beleg padhna | Vision model: `processInvoice` mein pehla page, `extractMultipleBills` mein har page (temperature 0.1) | Nahi |
| Category → SKR03 | Qwen sirf "category" aur "tax_regime" deta hai | `CATEGORY_SKR03_MAP` code mein (`:1031`) |
| §25a / 8193 / 8125 | Qwen ka `tax_regime` aur text regex | `exportService.ts:920-1139` maps |
| Document type | Qwen (pehle 3000 chars) ya vision | Pehle filename rules |
| Review gate "Ask AI" | Qwen advice (`/api/review/ask-ai`) | Questions khud rules se bante hain |
| Gemini cloud | Sirf agar `GEMINI_API_KEY` set ho: **poora PDF Google ko jaata hai** | – |

---

## 4. Bugs aur risks (severity ke hisaab se)

### Critical

| # | File:line | Problem | Asar |
|---|---|---|---|
| C1 | `server.ts` (sab routes), `authService.ts` | 67 routes mein se sirf 1 (`/api/auth/me`) par `requireAuth` hai. Admin users create/delete (`:2121-2156`), backup restore (`:2247`), documents, downloads aur review sab bina login ke khule hain. | Jo bhi port 5000 tak pahunch sake, saara customer data padh sakta hai, delete kar sakta hai, users bana sakta hai. |
| C2 | `storage/database.json`, `ai_extraction_cache.json`, `learned_suppliers.json` (git tracked) | Asli bank data (naam, IBAN ke tukde, amounts, VINs) git mein commit hai. HEAD mein 200+ "IBAN: DE.." strings hain. Remote: `github.com/fintaxdeveloper/fintax_project`. | DSGVO/data leak. Repo public ho ya leak ho jaaye to customer data bahar hai. Git history mein bhi rahega. |
| C3 | `authService.ts:254-255`, `LoginModal.tsx:443,803` | Staff/Admin OTP API response (`demoOtp`) mein wapas aata hai aur UI khud bhar deta hai. | 2FA bekaar hai. |
| C4 | `authService.ts:121`, `adminService.ts:140,358-360,421-423`, `server.ts:2123` | Plain-text password check (`plain === storedHash`). Naye users ka password plain store hota hai, default `password123`. Seed `admin123/staff123/client123` frontend mein bhi likhe hain (`AuthContext.tsx:40-42`). | Koi bhi admin ban sakta hai. DB leak = sab passwords leak. |
| C5 | `authService.ts:5` | Default JWT secret code mein hai (`fintax_enterprise_secret_key_2026_germany`). | Env set na ho to koi bhi token forge kar sakta hai. |
| C6 | `dbService.ts:16-24, 31-36, 58` | `getAll()` JSON parse fail hone par `[]` return karta hai. Uske baad `create()` sirf naya record likh deta hai. Writes atomic nahi hain (direct `writeFileSync`), aur har request poori 3 MB file read/write karti hai. | Do uploads ek saath hon ya write beech mein toot jaye to **poora database.json khatam** ho sakta hai. |
| C7 | `aiService.ts:482` | `extractMultipleBills` un files ke liye `[]` return karta hai jinke naam mein `kassenbeleg` ho. Scanned Kassenbelege ka sirf pehla page padha jaata hai (`:395`). | Kassenbelege ka 90% hissa kabhi book hi nahi hota. |
| C8 | `aiService.ts:91-312`, `:1124-1152`, `monthlyDocumentRegistry.ts` | Hardcoded demo bookings (City Grill, Lidl, Koyun). Sirf filename (`kassenbeleg` + `02_`) ya text words (`bruder`, `koyun`) par fixed amounts return hote hain. | Kisi bhi client ki "02_Kassenbelege.pdf" par galat, banawati bookings CSV mein ja sakti hain. |
| C9 | `aiService.ts:828-830, 821-824, 970-971, 992-994` | Amount na mile to `total = 100` ya `130` (handwritten) set ho jaata hai. Invoice number na mile to `BELEG-<random>`. | Banawati amounts DATEV mein jaate hain (GoBD violation). Random number har run par alag hota hai. |

### High

| # | File:line | Problem | Asar |
|---|---|---|---|
| H1 | `aiService.ts:1818-2143`, `exportService.ts:636-660, 985-1053, 1113-1125` | Takreeban 40+ QA24 ke customer/supplier naam, VINs aur amounts code mein hain (Qayumi, Zeller, Kilb, Scheurer, Fortia, Transiett, Autowelt Taunus, Smarttarif24→70001, `Math.round(amount)===1400`, waghera). | Doosre clients par galat accounts lagte hain. Naya client = code change. Accuracy "overfit" hai. |
| H2 | `exportService.ts:717-764` | Ek month ke **saare** Kontoauszüge merge hote hain. Dedupe filename se hota hai (lowercase), isliye "Kontoauszug (2).pdf" alag maana jaata hai. | Line-level dedupe toote (text thoda badle) to bank lines double ho jaati hain. |
| H3 | `validationService.ts:95-162`, `server.ts:632-649` | Same checksum dobara upload ho to bhi naya record ban jaata hai (sirf `is_duplicate` flag). Database mein ek hi Kontoauszug kai dafa `dup=false` ke saath pada hai. Takreeban 80 records mein checksum hi nahi hai. | Double processing, double bookings ka risk, storage aur AI time zaya. |
| H4 | `exportService.ts:797-828` | Beleg↔Bank match sirf "amount ±0.05 (ya +0.80)" hai, sirf usi month mein, aur pehla match jeet jaata hai. Invoice no, VIN aur naam ka koi order nahi. Partial payments support nahi. | Galat Beleg se galat account lag sakta hai. Pichle month ki invoice (July payment, June invoice) kabhi match nahi hoti. |
| H5 | `aiService.ts:911-916, 1100-1104` | `isHandwritten` tab true ho jaata hai jab summary mein "tea" ya "food" substring ho ("Team", "Steam", "Seafood"…). Phir payment cash aur Konto 1000 ho jaata hai. | Bank bookings galti se Kasse mein jaati hain. |
| H6 | `exportService.ts:1267` | Gegenkonto khali ho to silently `'3300'` (Wareneingang 7%) lag jaata hai. | Galat account bina review ke CSV mein. |
| H7 | `server.ts:1647-1719` (`handleAgendaExport`) | Agenda export review gate check **nahi** karta, aur docs ko EXPORTED mark kar deta hai. | Blocked month bhi export ho sakta hai. |
| H8 | `reviewService.ts:188-200` | `lineKey = DDMM|amount|S/H|konto|text28#occ`. Text ya OCR thoda badle to purane jawab orphan ho jaate hain. | User ke diye jawab re-processing ke baad gaayab ho jaate hain. |
| H9 | `reviewService.ts:708-716` | Kasse running balance hamesha 0 se shuru hota hai ("ohne Anfangsbestand"), aur month-to-month carry nahi hota. | Kasse ka plausibility check bekaar hai. Negative Kasse pakda nahi jaata. |
| H10 | `aiService.ts:1048, 1062` | §25a ka faisla poore extracted text par regex se hota hai. Car purchase mein `privat` word hi 3200 bana deta hai. Qwen ka `tax_regime` bina evidence ke maana jaata hai. | Galat 8193/8400/8125 aur Umsatzsteuer galat. |
| H11 | `exportService.ts:1128-1137` | Unresolved 8193 chupchap 8400 mein downgrade hota hai (sirf ≥ 500 € par review). | Choti §25a payments par 19% USt lag jaati hai. |
| H12 | Gemini fallback (`aiService.ts:434-462` etc.) | `GEMINI_API_KEY` set ho to poora customer PDF Google cloud jaata hai, bina consent/flag ke. | DSGVO/Mandantengeheimnis risk. |

### Medium

| # | File:line | Problem | Asar |
|---|---|---|---|
| M1 | `aiService.ts:726-730` | Date ki pehli priority pehla label match "Datum/Date" hai. Yeh Lieferdatum, Geburtsdatum ya Fälligkeit bhi ho sakta hai. | Galat Belegdatum, galat month. |
| M2 | `aiService.ts:714, 769`, `:1764`; `exportService.ts:163-217, 596-597` | Year na mile to `2026` ya current year. Date na mile to **aaj ki date**. | 2024 ke docs 2026 mein chale jaate hain. |
| M3 | `aiService.ts:609-611` | Multi-bill dedupe key `date|total` hai: same din, same amount ki do asli receipts (do tank fills) ek ban jaati hain. | Missing bookings. |
| M4 | `ollamaClient.ts:52-55` | Default temperature 0.1, seed nahi. Sirf bank classifier 0 par hai. | Har run par alag output, test reproducible nahi. |
| M5 | `aiService.ts:391` | Text sirf pehle 4500 chars tak, multi-bill mein 9000 chars. | Lambe docs ka aakhri hissa (totals) kat jaata hai. |
| M6 | `aiService.ts:1710` | Bank tx ki max 5 detail lines rakhi jaati hain. `ignoreDetailPattern` mein client ka address hardcoded hai (`QA24 GmbH|Rüsselsheimer Str|65428`). | Lambe Verwendungszweck (VIN/Re-Nr) kat jaate hain. Doosre client ka address filter nahi hota. |
| M7 | `exportService.ts:767-788` | Har H line jisme "0,80" SecureGo fee ho, split ho kar 4970 mein jaati hai. Yeh sahi hai ya nahi, asli Steuerberater reference se verify nahi hua (vault ke CSVs app ke apne banaye hue hain). | Possible galat split. |
| M8 | `bankStatementService.ts:241-243` | Period "Januar 2026" hardcoded hai. | Legacy route ka galat period. |
| M9 | `frontend/src/portals/ClientPortal.tsx:151` | Review report `month=8` hardcoded hai (jab document id na ho). | Galat month ka review khulta hai. |
| M10 | `reviewService.ts:144-168` | Unknown vendor options mein 2380 (Spenden) hai. 0730/4650/4600 nahi hain. | User aasani se galat account chun leta hai. |
| M11 | `ReviewGateModal.tsx` | Koi document preview nahi, sab issues ek flat list mein, ek car ke kai sawal alag alag. `issue.details` aur `suggest_upload` render nahi hote. | Review slow aur galti-prone. |
| M12 | `server.ts:36` | `cors({ origin: '*' })`. | C1 ke saath mil kar koi bhi website API call kar sakti hai. |
| M13 | `server.ts:949` | Path check `startsWith(vaultRoot)` bina separator ke hai (`vault` vs `vault2`). | Chhota path-traversal gap. |
| M14 | `aiCacheService.ts` | Cache key sirf file checksum hai, model/prompt version nahi. | Code/prompt badalne ke baad bhi purana (galat) result aata rehta hai. |

### Low

| # | File:line | Problem |
|---|---|---|
| L1 | `exportService.ts:416-417`, `datevExtfTemplates.ts:321,913` | Berater name `'niazi'` aur legacy Mandant `'710'` hardcoded. |
| L2 | `skr03Mapper.ts` vs `exportService.ts` | Soll/Haben convention ulti hai (mapper: purchase=S, export: purchase=H). Confusing. |
| L3 | `server.ts`, `aiService.ts`, `exportService.ts` | Bahut lambi files (2000+ lines), koi unit test nahi. |
| L4 | `aiService.ts:323, 1571` | Prompt mein "QA24 GmbH" fixed hai (har client ke liye). |
| L5 | `frontend/src/App.tsx:89`, `ReviewGateModal.tsx:98` | `http://localhost:5000/api` hardcoded, env se nahi. |
| L6 | `extfParser` jaisa kuch nahi; `monthlyDocumentRegistry.ts:20-47` | EXTF reading naive `split(';')` se hoti hai (quotes ke andar `;` toot jaata hai). |

---

## 5. Hardcoded cheezein

- **Client/supplier names:**
  - `aiService.ts:1690` (QA24 address)
  - `aiService.ts:1823` (soheil/qayumi)
  - `aiService.ts:1868` (tanja scheurer)
  - `aiService.ts:1898-1919` (BDK, Toyota Financial, Fortia, Bilar99e, Transiett, Van Hove, Auto Zuyd, Digitaldrive, Stern Wagen, Autowelt Taunus, Florian Liszaj, Qayumi, Mechthild Köbrich)
  - `aiService.ts:1984` (augustin logistic, schiebelhut, vossmeyer)
  - `aiService.ts:1989-2003` (tanja scheurer, intec ag, lidl)
  - `aiService.ts:2047` (gerhard zeller)
  - `aiService.ts:2058` (klaus kilb)
  - `aiService.ts:2076` (smarttarif24 → 70001)
  - `aiService.ts:2139` (transiett, augustin, kilb, scheurer, voigt, stanger)
  - `exportService.ts:636-645` (QA24, Jackson, Mustermann)
  - `exportService.ts:660` (koyun, royem döner, triberg, edeka bruder, payone, city grill, ben tenison)
  - `exportService.ts:987-1008` (QA24 VINs + customer names + amounts)
  - `exportService.ts:1028-1053` (macoil, maihan, volmarstein, haak, anvm, arstanbekova, eBay order numbers)
  - `exportService.ts:1113, 1125`
  - `clientFolderService.ts:98, 270-273` (`704_QA24 GbmH`)
  - `datevExtfTemplates.ts:330-352` (db service, payone)
- **Demo data:**
  - City Grill / Lidl / Koyun (`aiService.ts:91-312, 1124-1152`)
  - `monthlyDocumentRegistry.ts` (byte sizes jaise 1396972)
  - `AUGUST_2026_BOOKINGS` (`datevExtfTemplates.ts:979`)
  - `/api/*/seed-demo`, `/bank-statements/sample-demo` routes
- **Fixed months/years:**
  - Sparkasse month map 3/4/5/6 → filenames (`aiService.ts:64-69`)
  - default year 2026 (`:714, :769`)
  - "Januar 2026" (`bankStatementService.ts:241`)
  - `month=8` (`ClientPortal.tsx:151`)
- **Paths:**
  - `C:/Users/sh/Desktop/Project - Dubai.../CSVs` (`monthlyDocumentRegistry.ts:14`, `datevExtfTemplates.ts:869-870`)
  - `G:\My Drive` (`googleDriveService.ts:47,70`)
  - `../storage/...` relative to cwd, 10+ jagah: `server.ts:40-42`, `dbService.ts:6`, `reviewService.ts:118`, waghera
- **Amounts:**
  - fallback 100 € / 130 €
  - `tx.amount === 1400` (Scheurer)
  - `[12500, 25000]` Stammkapital
  - `aral && 19`
  - ARAL > 250 Kasse filter (`exportService.ts:849`)
  - Kasse > 50k filter
- **Credentials:** `admin123/staff123/client123` (backend + frontend), `password123`, JWT secret.

---

## 6. Security / data risks

1. **Customer data GitHub par hai (C2).** `storage/database.json` mein QA24 ke bank transactions (naam, IBAN ke hisse, VINs, amounts) commit hain, aur cache/learned files bhi.
   - Sirf `.gitignore` karna kaafi nahi, kyunki data history mein bhi hai. `git filter-repo` / BFG se history saaf karni hogi, aur check karna hoga ki repo private hai.
   - Yeh step **aapka faisla** hai, kyunki history rewrite karne par force-push lagta hai.
2. **Koi authorization nahi (C1)** aur CORS `*` hai. Server LAN par chale to sab khula hai.
3. **Passwords plain text mein hain (C4)**, OTP response mein leak hota hai (C3), aur JWT secret default hai (C5).
4. **Gemini cloud fallback (H12):** env key set hote hi data EU se bahar ja sakta hai.
5. **Vault PDFs:** `storage/vault/*` gitignored hai (achha). Lekin test-client folders mein asli QA24 PDFs pade hain. Naya `testdata/` bhi gitignore karna zaroori hai.
6. `.env` gitignored hai aur history mein nahi mila (achha). `.env.example` mein sirf placeholders hain.
7. Logs mein OTP print hota hai (`authService.ts:248`).

---

## 7. Kya achha bana hai (isko mat chhedo, sirf reuse karo)

- **Deterministic Kontoauszug parser** (`parseGermanBankStatement`): digital statement ke liye regex. Line, amount aur S/H reliable hain, opening/closing balance bhi nikalta hai. Sirf naam wale rules bahar nikaalne hain, parser ka core sahi hai.
- **Qwen confidence gate** (`enrichUnknownBankLinesWithOllama`): temperature 0, JSON schema, < 0.8 par auto-apply nahi, review mein bhejta hai. Yahi pattern baaki AI calls ke liye bhi hona chahiye.
- **"AI facts, code decides" approach** (`sanitizeOutput` mein `CATEGORY_SKR03_MAP`): Qwen sirf facts deta hai, account code tay karta hai.
- **Review gate concept** (`reviewService`): CRITICAL issues aur control checks (BANK_BALANCE, TRANSIT_1360, DATES_IN_MONTH) export block karte hain. Resolutions aur undo achhe hain.
- **EXTF column template** (`exportService.ts:13-145`), including unquoted empty indices: DATEV format sahi hai.
- **Embedded image extractor** (`pdfExtractor.ts:112-291`): scanned PDF ke page images bina external tool ke nikaalta hai (DCT/Flate/CMYK).
- **Checksum cache** (`aiCacheService`) aur `validationService.calculateChecksum`.
- **mathCrossValidationService** (Net/MwSt/Brutto correction) aur IBAN MOD-97.
- **ollamaClient** ki JSON repair, `<think>` stripping aur streaming (timeout se bachav).
- Client folder structure (`clientFolderService`) aur Drive sync ka design.

---

## 8. Recommended fix order

1. **Security (sabse pehle, chhote changes):**
   - `requireAuth`/`requireRole` saare routes par
   - `demoOtp` hatao
   - passwords hash karo (plain-text check hatao)
   - JWT secret env se lo, warna server start na ho
   - CORS ko `CLIENT_URL` tak seemit karo
2. **Data safety:**
   - `dbService` mein atomic write (temp file + rename) aur parse fail par crash, `[]` nahi
   - `storage/*.json` ko gitignore karo
   - GitHub history saaf karne ka faisla (aapka)
3. **Test harness (Plan Step 0):** `storagePaths` (sandbox), `uploadPipeline` ko `server.ts` se alag karo, `extfParser`, `npm run test:months`, aur "before" result record karo.
4. **Demo/fabricated data hatao** (C8, C9, Plan Step 1).
5. **Client names ko `storage/rules/<client>.json` mein move karo** (H1, Plan Step 2). Behaviour same rehna chahiye, test se verify.
6. **Duplicate upload aur ek active Kontoauszug** (H2, H3, Plan Step 3).
7. **Page-wise split aur Beleg index** (C7, Plan Step 4), phir **validation + temperature 0** (C9, M4, Plan Step 5).
8. **Matching** (H4), **tax decision** (H10, H11), **EXTF learning**, **car grouping** (H8) (Plan Steps 6-9).
9. **Kasse Anfangsbestand / carry-forward** (H9, Plan Step 10).
10. **Review UI** (M9-M11, H7, Plan Step 11).
11. Medium/Low cleanup: dates/years (M1, M2), cache versioning (M14), hardcoded paths/URLs (L5, M8).

> Note: vault ke `704_QA24 GbmH/.../00_CSV` EXTF files app ne khud banaye hain (`niazi`, `KASSE-BAR`). Isliye yeh sirf regression baseline hain, accuracy nahi. Asli Steuerberater files `testdata/2024-MM/reference/` mein aani chahiye.
