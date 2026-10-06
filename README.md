# Fleet Booking, Dispatch, Live Tracking & Fuel Platform
**CIRA Education & Badr University (BUC / BUA)**

An enterprise vehicle booking, operations dispatch, telemetry tracking, and algorithmic fuel chargeback web platform.

## Architecture & Canonical Routes

| Route | Authorized Role(s) | Screen / Feature |
|---|---|---|
| `/` | Public | Instant session-based auth redirector |
| `/login` | Public | CIRA SSO & departmental credentials login |
| `/home` | All (Role-tailored) | Dynamic dashboard per role |
| `/notifications` | All | Central notifications & audit alerts |
| `/vehicles` | Requester | Vehicle catalog & specifications |
| `/bookings/new` | Requester | Vehicle reservation request |
| `/bookings` | Requester | Department booking list & history |
| `/bookings/:id` | Requester, Dispatcher, Auditor | Booking detail & route manifest |
| `/bookings/:id/track` | Requester | Active GPS trip telemetry tracking |
| `/dispatch/queue` | Dispatcher | Approval, vehicle & driver assignment |
| `/dispatch/timeline` | Dispatcher | Gantt schedule & turnaround buffer monitoring |
| `/dispatch/map` | Dispatcher | Real-time fleet telemetry map hub |
| `/incidents/:id` | Dispatcher | Incident triage & emergency SOS handling |
| `/driver/shift` | Driver | Shift start log & safety inspection checklist |
| `/driver/trip` | Driver | Active trip manifest & roll call |
| `/driver/run` | Driver | Live run navigation & emergency SOS |
| `/driver/trip/close` | Driver | Trip closeout, end odometer & fuel receipts |
| `/admin/fleet` | Fleet Admin | Vehicles inventory, service & fuel price book |
| `/admin/drivers` | Fleet Admin | Driver licensing & duty hours compliance |
| `/admin/kpi` | Fleet Admin, Auditor | Fleet KPI analytics & emission metrics |
| `/audit` | Auditor | Audit log, fuel variance & chargeback bureau |
| `/policies` | All | Live policies & operational thresholds API |
| `/help` | All | 24/7 Operations Command Desk & directory |
| `403.html` | Public | Access Denied RBAC error page |

## Enforced Business Rules & Thresholds
- **Turnaround Buffer**: 45 minutes mandatory post-trip cleaning & handover.
- **Preparation Buffer**: 30 minutes pre-departure staging.
- **Minimum Booking Lead Time**: 4 hours prior to departure.
- **Self-Cancellation Window**: 2 hours without departmental penalty.
- **Max Driver Duty Hours**: 8.0 hours continuous driving / day.
- **Fuel Variance Flag**: ±10.0% vs algorithmic standard baseline.
- **Stale Telemetry Signal**: 5 minutes without GPS ping alert.
- **Fuel Price Book v3 (Effective 01 Aug 2026)**: Petrol 92 (22.25 EGP/L), Petrol 95 (24.00 EGP/L), Diesel (20.50 EGP/L), CNG (6.50 EGP/m³).

## Corporate Identity Standards
- Primary Burgundy: `#703845`
- Warm Gold Accent: `#CE9F51`
- Typography: Google Font `Cairo` & `JetBrains Mono`
- Strict inline SVG icons (no emoji characters)
- Official CIRA Logo & Emblem (sourced directly from https://cira.com.eg/):
  - `img/cira-logo.png`: Full official burgundy corporate logo
  - `img/cira-logo-white.png`: High-contrast pure white corporate logo for dark headers/footers
  - `img/cira-emblem.svg`: Vector SVG emblem (Burgundy `#703845`)
  - `img/cira-emblem-gold.svg`: Vector SVG emblem (Gold `#CE9F51`)
  - `img/cira-emblem-white.svg`: Vector SVG emblem (White `#FFFFFF`)
  - `img/favicon.svg` / `img/favicon-32x32.png` / `img/apple-touch-icon.png`: Official site favicons and app icons

