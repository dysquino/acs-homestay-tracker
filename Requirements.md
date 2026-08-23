# ACs Homestay Tracker — Requirements Document

## 1. Overview

**Project Name:** acs-homestay-tracker

**Purpose:** A simple, centralized web application for the owners/managers of ACs Homestay to track:
1. Bookings (Airbnb + direct)
2. Expenses (bills and other costs)
3. Cleaning schedules (cleaners assigned + payments)

**Guiding Principle:** Keep it simple. Avoid over-engineering — favor a lightweight stack, minimal setup, and an interface that a non-technical property manager can use without training.

**Hosting:** Deployed on Vercel.

**Users:** Up to 5 user accounts (owners/managers). No public-facing signup — accounts are created/managed internally.

---

## 2. Goals & Non-Goals

### Goals
- Give owners/managers one place to see all bookings, regardless of source (Airbnb or direct).
- Track income (per booking) and expenses (bills, supplies, repairs, etc.) to understand profitability.
- Track cleaning turnovers — who cleaned, when, and whether they've been paid.
- Support up to 5 authenticated users with simple login.
- Be simple to deploy, maintain, and extend.

### Non-Goals (out of scope for v1)
- No automatic two-way sync with Airbnb's calendar/API (bookings entered manually for now).
- No payment processing (e.g., no Stripe integration for collecting guest payments).
- No public guest-facing booking site.
- No multi-property support (single condo/unit for now, but data model should not actively prevent future expansion).
- No complex role-based permission tiers — all 5 users can be treated as equal access initially, unless otherwise specified (see Section 4.4).

---

## 3. User Roles & Accounts

- **Total accounts:** 5 (fixed, not self-serve signup).
- **Access:** Email + password login (or magic link — see tech stack options).
- **Roles:** All 5 accounts have **equal access** (no Admin/Manager distinction). Any user can add/edit/delete bookings, expenses, and cleaning records. *(Confirmed decision — kept simple for v1.)*
- Accounts are created manually by the owner (e.g., via a seed script or simple invite) — no open registration.

---

## 4. Functional Requirements

### 4.1 Bookings Module

**Purpose:** Track all reservations from Airbnb and direct bookings in one list/calendar.

**Fields per booking:**
| Field | Type | Notes |
|---|---|---|
| Guest name | Text | |
| Source | Dropdown | Airbnb / Direct |
| Check-in date | Date | |
| Check-out date | Date | |
| Number of guests | Number | |
| Total payout / rate | Currency | What the owner actually receives |
| Platform fee (if Airbnb) | Currency | Optional, for profitability tracking |
| Payment status | Dropdown | Paid / Pending / Partial |
| Contact number/email | Text | Optional, for direct bookings |
| Notes | Text | Special requests, etc. |

**Features:**
- List view of all bookings (sortable/filterable by date, source, payment status).
- **Calendar view** (confirmed requirement) to visually see occupied vs. vacant dates — helps prevent double-booking between Airbnb and direct guests. Each date range should be color-coded by source (e.g., Airbnb vs. Direct) and clickable to view/edit the booking's details.
- Add / edit / delete a booking.
- Simple conflict warning if a new booking's dates overlap an existing one.

### 4.2 Expenses Module

**Purpose:** Track all outgoing costs related to the condo.

**Fields per expense:**
| Field | Type | Notes |
|---|---|---|
| Date | Date | |
| Category | Dropdown | Utility bill, Association dues, Repairs, Supplies, Cleaning payment (can link to 4.3), Other |
| Description | Text | |
| Amount | Currency | |
| Paid by | Text/Dropdown | Which owner/manager paid |
| Receipt/attachment | File upload (optional) | Nice-to-have, not required for v1 |

**Features:**
- List view of all expenses (filterable by date range and category).
- Monthly summary (total expenses per month).
- Simple income vs. expense summary (pulls totals from Bookings + Expenses) — a basic profitability snapshot.

### 4.3 Cleaning Schedule Module

**Purpose:** Track cleaning turnovers between guests, who's assigned, and payment status.

**Fields per cleaning record:**
| Field | Type | Notes |
|---|---|---|
| Date | Date | Usually tied to a checkout date |
| Linked booking | Reference (optional) | Link to the booking that triggered this cleaning |
| Cleaner name | Text/Dropdown | |
| Status | Dropdown | Scheduled / Completed |
| Payment amount | Currency | |
| Payment status | Dropdown | Paid / Unpaid |
| Notes | Text | e.g., laundry, restocking needed |

**Features:**
- List view of cleaning records (filterable by cleaner, date, payment status).
- **Auto-suggest cleaning records** (confirmed requirement): whenever a new booking is added with a check-out date, the system automatically creates a corresponding cleaning record (status: "Scheduled", date pre-filled to the check-out date, linked to that booking). Users can then edit it to assign a cleaner and payment details, or delete it if not needed.
- Simple "unpaid cleaners" view — quick list of who's still owed payment.

### 4.4 Dashboard / Overview (Recommended)

A simple home screen showing:
- Upcoming check-ins/check-outs (next 7 days).
- This month's total income vs. expenses.
- Any unpaid cleaning payments.
- Any pending guest payments.

This ties the three modules together without requiring the user to jump between pages constantly.

---

## 5. Simple Data Model

Keeping it minimal — 4 main tables:

```
users
- id
- name
- email
- password_hash (or auth provider ID)
- role (admin/manager) [optional if not using roles]

bookings
- id
- guest_name
- source (airbnb/direct)
- check_in
- check_out
- guests_count
- total_payout
- platform_fee
- payment_status
- contact_info
- notes
- created_by (user_id)

expenses
- id
- date
- category
- description
- amount
- paid_by
- receipt_url (optional)
- created_by (user_id)

cleaning_schedule
- id
- date
- booking_id (nullable, FK to bookings)
- cleaner_name
- status
- payment_amount
- payment_status
- notes
- created_by (user_id)
```

This is intentionally flat and simple — no complex joins beyond linking cleaning records to bookings, which is optional.

---

## 6. Recommended Tech Stack (Simple & Vercel-Friendly)

Since simplicity is the priority, here are the recommended choices:

| Layer | Recommendation | Why |
|---|---|---|
| Frontend/Backend | **Next.js** (App Router) | Deploys natively on Vercel, handles both UI and API routes in one project. |
| Database | **Supabase** (confirmed) | Standard Postgres under the hood — data can be exported anytime via CSV (built-in table editor) or a full `pg_dump`, with no vendor lock-in. Free tier is sufficient for this scale. |
| ORM | **Prisma** | Makes the simple data model above easy to define and query without writing raw SQL. |
| Auth | **Supabase Auth** | Bundled with the database choice above — simple email/password login for a fixed 5-user system, no separate auth provider needed. |
| UI | **Tailwind CSS** + a simple component kit (e.g., shadcn/ui) | Fast to build clean, functional forms and tables without custom design work. |
| Calendar | **FullCalendar** (React) or a lightweight equivalent | Handles the booking calendar view with color-coded date ranges by source. |
| Hosting | **Vercel** | As required. |

**Data export:** Since Supabase is standard Postgres, data can be exported at any time as CSV (per table, via the Supabase dashboard) or as a full SQL dump (`pg_dump`) for migration to another host if ever needed. No proprietary format lock-in.

---

## 7. Non-Functional Requirements

- **Simplicity:** Prioritize a clean, minimal UI over feature richness. Tables and forms over dashboards with charts (charts optional/later).
- **Performance:** Should load quickly for up to a few hundred bookings/expenses/cleaning records — no special optimization needed at this scale.
- **Security:** 
  - Login required for all pages (no public access).
  - Passwords hashed (never stored in plain text).
  - HTTPS enforced (default on Vercel).
- **Mobile-friendly:** Should be usable on a phone browser, since managers may check bookings/cleaning on the go.
- **Backups:** Managed database (Neon/Supabase) handles automated backups — no manual backup process needed initially.

---

## 8. Deployment

- Hosted on **Vercel** (free/hobby tier should be sufficient for 5 users and this scale of data).
- Database hosted on **Supabase** (free tier).
- Environment variables (Supabase connection string, API keys, auth secrets) managed via Vercel's dashboard.
- Custom domain optional (can use the default `*.vercel.app` URL initially).

---

## 9. Future Enhancements (Not in v1)

- Airbnb iCal sync (import bookings automatically instead of manual entry).
- Multi-property support.
- Reporting/analytics dashboard with charts (monthly revenue trends, occupancy rate, etc.).
- Guest communication log.
- Automated reminders for upcoming cleanings or unpaid cleaner payments.
- Receipt photo upload for expenses.

---

## 10. Confirmed Key Decisions

1. **Access:** All 5 accounts have equal access — no role tiers.
2. **Database:** Supabase (Postgres) — chosen for easy future data export (CSV or full SQL dump) with no vendor lock-in.
3. **Bookings view:** Calendar view required, color-coded by source (Airbnb vs. Direct).
4. **Cleaning records:** Auto-suggested from each booking's check-out date, editable/deletable afterward.
