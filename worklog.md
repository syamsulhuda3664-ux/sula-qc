# SULA-QC Worklog

## 2026-07-31 — Core Library Files Initial Setup

### Files Created

1. **`.env.local`** — Supabase environment variables
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **`src/lib/supabase.ts`** — Supabase client initialization
   - Exports `supabase` (anon client) and `adminClient` (service role client)
   - Auto-refresh disabled for admin client

3. **`src/lib/i18n.ts`** — Internationalization system
   - Full bilingual translations (zh/en) covering ~180+ keys
   - Sections: login, sidebar/menu, dashboard, FQC, OQC, IPQC, user management, settings, defect categories, severity, disposition, business types, roles, common actions, validation, time filters
   - All 10 FQC defect categories bilingual
   - All 4 roles mapped to language preference
   - `getTranslations(lang)` and `getRoleLanguage(role)` exports
   - Helper `t(key, lang)` function for quick lookups

4. **`src/lib/aql.ts`** — ANSI/ASQ Z1.4 Level II AQL 2.5 lookup table
   - 14 lot size ranges from 2-8 up to 150001-500000
   - `getAQLCode(lotSize)` returns `{ code, sampleSize, ac, re }`
   - `getAQLTable()` for reference/display
   - `determineDisposition()` helper

5. **`src/lib/fqc-parser.ts`** — FQC Excel file parser
   - Imports `xlsx` as namespace (`import * as XLSX from 'xlsx'`)
   - Parses FQC Excel format: Row 0=title, Row 1=headers, Row 2=sub-defects, Row 3+=data, Last row=total
   - Column mapping: A-K (data), L-BW (61 sub-defect columns across 10 categories)
   - Business type derived from order number prefix (PTOEM, PTB2C, PTGH)
   - Stores all 61 individual sub-defect values
   - `parseFQCExcel(buffer)` returns `{ date, records[], businessType }`
   - `getSubDefectNames(sheet)` extracts Chinese sub-defect names

6. **`src/lib/oqc-generator.ts`** — OQC lot result generator
   - `generateOQCLot(date, fqcRecords)` creates synthetic OQC inspection results
   - Groups FQC OK qty by date, determines AQL code/sample from total lot size
   - Leakage factor: 5-15% of FQC defects leak through to OQC
   - 7 OQC defect categories (different from FQC): Packaging, Label, Accessory, Appearance, Hardware, Stitching, Other
   - Severity distribution: mostly Minor, some Major, rare Critical
   - Disposition logic: AQL reject check → internal control 98.5% → RELEASE
   - Deterministic via seeded PRNG from date
   - Returns `OQCLot` with full details, orders, and individual defects

7. **`src/lib/ipqc-generator.ts`** — IPQC record generator
   - `generateIPQCRecords(fqcRecords)` creates synthetic IPQC records
   - 4 stages: Cutting, Sewing, Assembly, Finishing
   - Each FQC record generates 1-2 IPQC records at earlier stages
   - IPQC pass rate slightly higher than FQC (90-97%)
   - Defect categories mapped from FQC patterns to IPQC stage categories
   - IPQC inspection date is 1-3 days before FQC date

8. **`src/lib/rca-generator.ts`** — Weekly Root Cause Analysis generator
   - `generateWeeklyRCA(weekStart, weekEnd, fqcRecords)` aggregates weekly data
   - Filters records by date range
   - Aggregates defects by category, identifies Top 3 categories
   - For each top category, extracts Top 10 sub-defects
   - Also produces Top 15 styles by defect count
   - Returns `RCAWeekly` with complete statistics and rankings
   - Includes 62 sub-defect name definitions mapped to categories

### Technology Notes
- All files use TypeScript with strict typing
- No default exports from `xlsx` — uses `import * as XLSX from 'xlsx'`
- Deterministic random generation using seeded PRNG for reproducible OQC/IPQC data
- All generators work with the FQC record type matching `fqc_inspections` table columns

## 2026-08-01 — API Routes (Auth, Users, FQC, OQC, IPQC, Export)

### Dependency Added
- `jose@6.2.7` — JWT signing/verification for session tokens

### Files Created

1. **`src/lib/auth.ts`** — Authentication & authorization middleware
   - JWT-based session management via `jose` (HS256, 24h expiry)
   - `signToken(user)` / `verifyToken(token)` — JWT create/verify
   - `getSessionUser()` — extract user from cookie
   - `createSessionCookie(token)` / `createLogoutCookie()` — cookie helpers
   - `authenticateRequest(request, required)` — main middleware; validates session, checks role access
   - Role access control: `staff_qa`/`manager_qc` = full (POST/PUT/DELETE/GET), `manager_umum`/`spv_qc` = view (GET only)
   - Returns 401 if unauthenticated, 403 if insufficient access
   - Re-exports `getRoleLanguage` from `i18n.ts` for convenience

2. **`src/app/api/auth/login/route.ts`** — POST: Login
   - Validates username/password against `users` table (bcrypt compare)
   - Checks `is_active` flag
   - Returns user object + sets JWT as HttpOnly cookie

3. **`src/app/api/auth/me/route.ts`** — GET: Current user info
   - Extracts user from session cookie
   - Returns user id, username, display_name, role, language

4. **`src/app/api/auth/logout/route.ts`** — POST: Clear session
   - Sets session cookie with Max-Age=0

5. **`src/app/api/users/route.ts`** — GET/POST: User management
   - GET: List all users (staff_qa only). Supports `role`, `active` filters
   - POST: Create user (staff_qa only). Validates role, checks uniqueness, bcrypt-hashes password

6. **`src/app/api/users/[id]/route.ts`** — PUT/DELETE: User management
   - PUT: Update user (staff_qa only). Can update display_name, role, password
   - DELETE: Deactivate user (staff_qa only). Cannot deactivate self

7. **`src/app/api/fqc/upload/route.ts`** — POST: Upload & process FQC Excel
   - Multipart form file upload (xlsx/xls only)
   - Calls `parseFQCExcel()` to parse the file
   - Inserts records into `fqc_daily_uploads` and `fqc_inspections`
   - Calls `generateOQCLot()` and inserts into `oqc_daily_lots`, `oqc_lot_orders`, `oqc_defects`
   - Calls `generateIPQCRecords()` and inserts into `ipqc_records`
   - Returns summary with counts

8. **`src/app/api/fqc/inspections/route.ts`** — GET: Query FQC inspections
   - Filters: date_from, date_to, period (day/week/month/quarter/year), ref_date, business_type, production_line, style_code, order_no
   - Period filter auto-computes date range from current or reference date
   - Pagination support (page, page_size)
   - Returns records + aggregated subtotals (all defect categories, avg defect rate)

9. **`src/app/api/fqc/analysis/route.ts`** — GET: Defect analysis
   - Section A: Category summary (10 categories sorted by defect count)
   - Section B: Top 20 sub-defects with category mapping
   - Section C: Top 15 styles by defect count with defect rates
   - Filters: date_from, date_to, business_type

10. **`src/app/api/fqc/rca/route.ts`** — GET/POST: Weekly RCA
    - GET: List RCA records with their actions (joined query)
    - POST: Generate new RCA for a given week. Calls `generateWeeklyRCA()`. Checks for duplicates (409)

11. **`src/app/api/fqc/rca/[id]/actions/route.ts`** — PUT: Update RCA actions
    - Updates root_cause, corrective_action, preventive_action, responsible, due_date, status
    - Upserts: creates action if not exists, updates if exists

12. **`src/app/api/oqc/lots/route.ts`** — GET: Query OQC daily lots
    - Filters: date_from, date_to, business_type, disposition
    - Returns lots with joined `oqc_lot_orders` and `oqc_defects`
    - Aggregated summary: totals, disposition counts, quantities

13. **`src/app/api/oqc/rekap/route.ts`** — GET: Monthly/quarterly/yearly OQC summary
    - Period parameter (month/quarter/year) + value (e.g., '2026-07')
    - Returns aggregated stats: lot sizes, sample sizes, pass rates, disposition breakdown
    - Includes daily breakdown for the period

14. **`src/app/api/ipqc/route.ts`** — GET: Query IPQC records
    - Filters: date_from, date_to, business_type, production_line, stage
    - Returns records + subtotals with per-stage breakdown (Cutting/Sewing/Assembly/Finishing)

15. **`src/app/api/export/route.ts`** — POST: Export data
    - Body: `{ type: 'fqc'|'oqc'|'ipqc', filters: {...} }`
    - Returns JSON data (Excel file generation with watermark to be handled separately)

### Architecture Notes
- All Supabase operations use `adminClient` (service role key) — auth is handled by our own JWT system
- Session stored as HttpOnly, Secure (in production), SameSite=Lax cookie
- All API routes use `authenticateRequest()` middleware for consistent auth + RBAC
- View-only roles (`manager_umum`, `spv_qc`) are blocked from POST/PUT/DELETE (403)
- FQC upload is a composite operation: parse → insert inspections → generate OQC → generate IPQC → insert all
- Lint clean (0 errors in new code; 1 pre-existing error in `scripts/setup-db.js`)

## 2026-08-03 — Complete Frontend Implementation

### Files Created (14 files)

1. **`src/contexts/AuthContext.tsx`** — React context for auth state
   - `AuthProvider` wraps entire app
   - Provides: `user`, `login()`, `logout()`, `loading`, `view`, `setView()`, `isFullAccess`
   - Checks `/api/auth/me` on mount to restore session
   - Login posts to `/api/auth/login` and sets user state on success
   - Logout posts to `/api/auth/logout` and clears user state
   - `isFullAccess` computed from role (staff_qa, manager_qc = true)
   - View state management for client-side routing (login/dashboard)

2. **`src/hooks/useI18n.ts`** — Custom i18n hook
   - Returns `{ t, lang, translations }` based on current user's role
   - Uses `getRoleLanguage(role)` from i18n.ts to determine language
   - Memoized translations for performance

3. **`src/app/page.tsx`** — Root page (client-side router)
   - Wraps everything in `AuthProvider`
   - Shows loading spinner during auth check
   - Routes to `LoginPage` or `DashboardLayout` based on auth state
   - No `next/router` used — pure React state for view switching

4. **`src/app/login/page.tsx`** — Login page
   - Split-screen design: dark branding panel (lg) + white form
   - SULA logos centered (white on dark panel, colored on form)
   - Username/password form with validation
   - Error alert display
   - Loading state with spinner
   - All text via i18n translations

5. **`src/app/(dashboard)/layout.tsx`** — Dashboard layout
   - Extracted `SidebarNav` component (props-based, avoids lint errors)
   - Dark slate-900 sidebar (64px collapsed / 256px expanded)
   - 9 menu items with icons, role-based visibility
   - Red badge dot on FQC RCA when pending actions detected
   - Mobile: hamburger menu opens `Sheet` with sidebar
   - Collapsible sidebar with toggle button
   - Top header: page title, language badge, user name, logout
   - Client-side page switching via `activePage` state
   - All menu text via i18n

6. **`src/app/(dashboard)/dashboard/page.tsx`** — Main dashboard
   - 4 stat cards: Total Inspected, Pass Rate, NG Count, Active Lots
   - Business type filter tabs (All / PTOEM / PTB2C / PTGH)
   - Period selector (Daily / Weekly / Monthly / Quarterly / Yearly)
   - Pass rate trend line chart (recharts, last 14 data points)
   - Defect distribution donut chart (pie chart, top 6 categories)
   - Top 5 defects horizontal bar chart
   - Recent activity tables: last 5 FQC uploads, last 3 OQC lots
   - Color-coded pass rates (green >=95%, red <90%)
   - Loading skeletons for all sections

7. **`src/app/(dashboard)/fqc/daily/page.tsx`** — FQC Daily Detail
   - Filters: date range, business type, production line
   - Full data table: No, Date, Line, Inspector, Style, Order No, Order Qty, Inspected, OK, NG, Defect Rate, 10 defect columns
   - Subtotals row (aggregated)
   - Sticky header, scrollable table (max-h-600px)
   - Pagination with prev/next
   - Download Excel button
   - Red highlighting for NG counts and high defect rates

8. **`src/app/(dashboard)/fqc/analysis/page.tsx`** — FQC Defect Analysis
   - Section A: Category Summary (rank, name, count, %, PPM, progress bar)
   - Section B: Top 20 Sub-Defects (name, category, count, %)
   - Section C: Top 15 Styles by Defects (style, count, inspected, rate)
   - Same filters as daily page
   - Loading skeletons

9. **`src/app/(dashboard)/fqc/rca/page.tsx`** — FQC Root Cause Analysis
   - Week selector dropdown (last 12 weeks)
   - Business type filter
   - Generate RCA button (full access only)
   - 5 summary stat cards (inspections, inspected, OK, NG, pass rate)
   - Top 3 categories with Top 5 sub-defects each
   - Fillable action table: Style, Root Cause, Impact, Process, Corrective Action, Photo upload, Preventive Action, Deadline
   - Save button (full access only)
   - Empty state with guidance text

10. **`src/app/(dashboard)/fqc/upload/page.tsx`** — FQC Upload
    - Drag & drop zone with file type validation (.xlsx/.xls)
    - Click-to-upload alternative
    - File size display
    - Upload progress bar
    - Success/error result display with record count
    - Full access only (hidden for view-only roles)

11. **`src/app/(dashboard)/oqc/lots/page.tsx`** — OQC Daily Lots
    - Filters: date range, business type, disposition
    - 4 summary cards: lot size, sample size, total defects, disposition breakdown (R/W/H badges)
    - Table: Date, Lot Size, AQL Code, Sample, Ac, Re, Critical, Major, Minor, Total, Sample OK, Pass Rate, Disposition, Remarks
    - Color-coded disposition badges (green=RELEASE, amber=REWORK, red=HOLD)
    - Pagination
    - Download Excel button

12. **`src/app/(dashboard)/oqc/rekap/page.tsx`** — OQC Rekap
    - Period selector tabs (Monthly/Quarterly/Yearly) + value input
    - Business type filter
    - 6 summary cards: Lot Size, Sample Size, Pass Rate, Release/Rework/Hold counts
    - Daily breakdown table
    - Defect severity summary table (Critical/Major/Minor)
    - Color-coded pass rates

13. **`src/app/(dashboard)/ipqc/page.tsx`** — IPQC Records
    - Filters: date range, business type, production line, stage
    - 4 stage summary cards with icons (Cutting/Scissors, Sewing/Wrench, Assembly/Layers, Finishing/Sparkles)
    - Color-coded stage badges
    - Table: Date, Line, Style, Order, Stage, Check, OK, NG, Pass Rate, Defects, Detail
    - Pagination

14. **`src/app/(dashboard)/users/page.tsx`** — User Management (staff_qa only)
    - User table: Username, Display Name, Role, Status, Created, Actions
    - Add User dialog with username, display name, password, role fields
    - Edit User dialog (pre-filled, optional password reset)
    - Deactivate user with confirmation
    - Role dropdown with 4 options and i18n labels
    - Status badges (active/inactive)
    - Loading skeletons

### Design System
- **Color Scheme**: Dark slate-900 sidebar, white content, emerald/teal for positive, red for negative
- **Components**: All shadcn/ui (Card, Table, Button, Input, Select, Dialog, Tabs, Badge, Sheet, Skeleton, Progress, Alert, ScrollArea)
- **Charts**: recharts (LineChart, PieChart, BarChart with ResponsiveContainer)
- **Responsive**: Mobile-first with collapsible sidebar, Sheet for mobile nav
- **i18n**: All text via `useI18n()` hook based on user role
- **RBAC**: View-only users (manager_umum, spv_qc) see no upload/create/edit/delete buttons
- **Loading States**: Skeleton placeholders for all data-fetching pages
- **Empty States**: Helpful messages when no data available
- **Lint**: 0 errors in new code (1 pre-existing in scripts/setup-db.js)
- **Compile**: Clean, no errors

## 2026-08-04 — Excel Export Functionality

### Files Created / Updated

1. **`src/lib/excel-export.ts`** — Excel generation library (NEW)
   - 4 exported functions for generating bilingual Excel files:
     - `exportFQCDailyExcel(data, filters, lang)` → FQC Daily Detail report
     - `exportFQCAnalysisExcel(data, filters, lang)` → FQC Defect Analysis report
     - `exportFQCOQCExcel(data, filters, lang)` → OQC Rekap report
     - `exportIPQCExcel(data, filters, lang)` → IPQC Records report
   - Each returns `{ buffer: Uint8Array, fileName: string }`
   - Bilingual headers: Mandarin (中文) + English for ALL labels and columns
   - Company title: '厦门市欣维发实业有限公司品质检验表' for FQC reports
   - 'SULA-QC' in title for OQC and IPQC reports
   - Text watermark 'SULA-QC' across title area (large light gray text, merged cells)
   - Uses `import * as XLSX from 'xlsx'` (consistent with existing fqc-parser.ts)
   - Proper column widths for all sheets
   - Number formatting: defect rates as percentages, quantities as numbers
   - FQC Daily Detail: 21 columns (No, Date, Line, Inspector, Style, Order No., Order Qty, Inspected, OK, NG, Defect Rate, 10 defect categories), daily subtotals grouped by date, grand total row
   - FQC Analysis: 3 sections (Category Summary, Top 20 Sub-Defects, Top 15 Styles) with rankings
   - OQC Rekap: Summary KPIs (lot size, sample, pass rate, disposition counts), daily breakdown by date, defect category summary with severity breakdown
   - IPQC: Stage summary (Cutting/Sewing/Assembly/Finishing), detail records table with defect details, grand total
   - File naming: `SULA-QC_FQC_Daily_2026-04.xlsx`, `SULA-QC_FQC_Analysis_...xlsx`, `SULA-QC_OQC_Rekap_Q2-2026.xlsx`, `SULA-QC_IPQC_...xlsx`
   - Styled headers (blue background, white bold text), subtotal rows (light blue), grand total rows (dark background, white text)
   - Filter information displayed below title (date range, business type)
   - Timestamp footer: "Generated by SULA-QC System on YYYY-MM-DD"
   - Exports `ExportFilters`, `ExportLang`, `ExcelExportResult` types

2. **`src/app/api/export/route.ts`** — Export API route (UPDATED)
   - Changed from JSON response to binary Excel file download
   - Export types expanded: `'fqc-daily' | 'fqc-analysis' | 'oqc' | 'ipqc'` (was `'fqc' | 'oqc' | 'ipqc'`)
   - Accepts POST body: `{ type, filters: { businessType?, dateFrom?, dateTo?, period? } }`
   - Supports both camelCase (`dateFrom`, `businessType`) and snake_case (`date_from`, `business_type`) filter keys
   - Language determined from user role via `getRoleLanguage()`
   - Fetches data from Supabase using adminClient based on type + filters
   - Returns `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` content type
   - Sets `Content-Disposition: attachment; filename="..."` for browser download
   - OQC query includes joined `oqc_lot_orders` and `oqc_defects` tables
   - All 4 export types produce proper binary `.xlsx` files

### Technology Notes
- Uses xlsx community edition v0.18.5 (already in dependencies)
- Cell styling applied via `cell.s` property (font, fill, alignment)
- Cell merges for title rows, watermark, filter info, and subtotal labels
- Column widths set via `ws['!cols']` array
- Row heights set via `ws['!rows']` for title rows
- Sheet ranges set via `ws['!ref']` for proper Excel rendering
- No server-side file I/O — everything generated in memory as Uint8Array
- Lint: 0 errors in new/modified code (1 pre-existing in scripts/setup-db.js)
