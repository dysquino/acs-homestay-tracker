# ACs Homestay Reconciliation and Monthly Audit Specification

**Document status:** Proposed implementation specification  
**Product:** ACs Homestay Tracker  
**Scope:** Single-bank reconciliation for booking income and operating expenses  
**Primary users:** ACs Homestay owners and managers  
**Last updated:** October 12, 2026

---

## 1. Purpose

This document specifies a reconciliation workspace and monthly audit workflow for ACs Homestay Tracker.

The feature will help owners and managers compare the transactions recorded in the tracker with the transactions that actually appeared in the homestay's single bank account. It will support booking receipts, Airbnb payouts, direct-booking payments, operating expenses, cleaning payments, owner reimbursements, guest refunds, bank fees, interest, and other bank adjustments.

The feature is intended to answer four questions reliably:

1. Which expected booking payments have reached the bank?
2. Which recorded expenses have left the bank?
3. Which transactions remain outstanding or unexplained?
4. Does the calculated ending balance agree with the bank statement at month end?

The reconciliation workspace should preserve the fast amount-matching interaction demonstrated by the approved concept while remaining simple enough for occasional use by a non-accountant.

---

## 2. Confirmed Product Decisions

The following decisions are considered requirements unless this specification is revised:

- ACs Homestay currently uses one bank account for the transactions covered by this feature.
- The interface must not display bank-selection tabs or require an account selection.
- Reconciliation is based on actual cash movement through the bank, not solely on booking stay dates or expense record dates.
- A booking may have more than one payment.
- Partial booking payments must be supported.
- Owner-fronted expenses do not count as bank outflows until the owner is reimbursed from the homestay bank account.
- The system may be used on desktop and mobile.
- The mobile experience must be a purpose-built responsive layout, not a compressed desktop screen.
- A month can be finalized only through the Monthly Audit workflow.
- Finalization locks that month against ordinary reconciliation changes.
- Reopening a finalized month must require an explicit reason and must be recorded in the audit trail.
- Currency is Philippine peso (PHP).
- Financial calculations must use integer centavos or an exact decimal type. JavaScript floating-point values must not be used as the authoritative persisted calculation.
- All money in the reconciliation domain is persisted as `Decimal(10, 2)` at the database layer, matching the existing money columns and `MAX_MONEY` in `validation.ts`. Sum, difference, and running-balance arithmetic must be performed in integer centavos (bigint) using helpers in `src/lib/finance.ts`; the application code must not use JavaScript `number` math for any financial aggregate.

---

## 3. Goals

### 3.1 Primary goals

- Provide one place to reconcile expected booking income and expense outflows against a bank statement.
- Make exact-amount matching fast on desktop and mobile.
- Support both individual and grouped matches.
- Preserve outstanding transactions across month boundaries.
- Produce a clear monthly ledger and audit summary.
- Prevent silent changes to finalized periods.
- Preserve who performed matching, finalization, reopening, and adjustment actions.
- Integrate with existing bookings, expenses, cleaning payments, and identity attribution.

### 3.2 Secondary goals

- Highlight possible matches automatically.
- Reduce duplicate booking-payment and expense records.
- Make unexplained deposits and withdrawals visible instead of forcing them into unrelated records.
- Provide printable and exportable month-end reports.
- Prepare the data model for optional bank-statement CSV import later.

### 3.3 Non-goals for the first release

- Direct integration with a bank API.
- Automated bank login or transaction scraping.
- Multiple bank-account reconciliation.
- Full double-entry accounting or a general ledger.
- Tax filing or tax-compliance automation.
- Automatic revenue recognition by accounting standards.
- Multi-currency bank reconciliation.
- Automatic matching based on machine learning.

---

## 4. Accounting and Domain Rules

### 4.1 Cash reconciliation versus profitability reporting

The existing dashboard may allocate booking income across occupied nights for profitability reporting. Reconciliation must use the date and amount on which money actually reaches or leaves the bank.

Examples:

- A July stay paid in June is a June bank inflow, even if its operational revenue is shown in July.
- An Airbnb stay ending on July 31 with an August 2 payout is an August bank inflow.
- A July expense purchased personally by an owner is not a homestay bank outflow until the owner is reimbursed.
- A cleaning completed in July but paid in August is an August bank outflow.

Profitability reporting and bank reconciliation therefore remain related but separate views of the same business activity.

### 4.2 Booking income

- A booking's `totalPayout` is the expected amount the homestay ultimately receives.
- Airbnb platform fees must not be subtracted again when `totalPayout` already represents the net payout.
- Every actual receipt must be represented by a booking-payment record.
- A booking can have zero, one, or many booking-payment records.
- The sum of non-voided booking payments determines how much has been received.
- A booking is fully paid when valid payments equal its expected payout within the configured centavo tolerance.
- A booking is partially paid when valid payments are greater than zero but less than the expected payout.
- An overpayment must be clearly flagged and cannot be silently absorbed. The booking's cached `paymentStatus` reflects this as `OVERPAID` (see §12.1).
- Guest refunds must be represented as outflows, not as negative booking payments hidden inside the receipt total.
- A `BookingPayment` is `REFUNDED` only when its full amount is reversed by the homestay. Partial refunds are represented as a separate `ExpenseSettlement` of type `GUEST_REFUND` against the booking, leaving the original payment `ACTIVE`.

### 4.3 Airbnb payouts

- Airbnb payouts are booking receipts when they appear in the bank.
- One payout may cover one booking or several bookings.
- A single statement deposit must therefore be able to match multiple booking-payment records.
- The payout reference or confirmation code should be captured when known.
- If Airbnb deducts or adjusts an amount outside the expected net payout, the difference must be represented explicitly as a refund, fee, or adjustment.

### 4.4 Direct-booking payments

- Deposits, installments, and final balances are separate booking-payment records.
- Each payment records its received date, amount, method, and optional reference.
- The bank-posting date is recorded when the payment is reconciled.
- A payment screenshot supports evidence but does not by itself constitute reconciliation.

### 4.5 Expenses

- An expense represents the business purpose and amount of a cost.
- A settlement represents the actual movement of money from the homestay bank.
- An expense may be settled in one payment or multiple payments.
- If an owner pays personally, the expense exists but does not affect the bank until reimbursement.
- Reimbursement to the owner becomes an expense settlement on the bank payment date.
- If the homestay pays the vendor directly, the settlement may occur on the same date as the expense.

### 4.6 Cleaning payments

- Paid cleaning records currently create or manage an expense.
- The reconciliation layer must avoid counting both the cleaning record and its linked expense as separate outflows.
- The expense settlement is the authoritative bank-impacting record.
- Marking a cleaning as paid must create an `ExpenseSettlement` of type `CLEANER_PAYMENT` against the linked expense, with the bank-posting date the owner enters. The existing `Expense` row remains the business-purpose record; the settlement is what reaches the bank. A cleaning may not be marked paid in the reconciliation workspace without an associated settlement.

### 4.7 Adjustments

Adjustments represent legitimate bank movements not directly tied to a booking payment or expense settlement.

Supported adjustment categories should include:

- Bank fee
- Bank interest
- Chargeback
- Owner contribution
- Owner withdrawal
- Transfer correction
- Duplicate correction
- Other

Guest refunds are not adjustments — they are modeled as `ExpenseSettlement` of type `GUEST_REFUND` (§11.2) so they participate in expense-settlement totals consistently with the rest of the homestay outflows.

Every adjustment requires:

- Direction: inflow or outflow
- Amount
- Effective date
- Bank-posting date
- Category
- Description
- Creator identity
- Creation timestamp

Adjustments must not create fake bookings or ordinary expenses.

### 4.8 Outstanding transactions

- Uncleared transactions remain available regardless of their original month.
- A payment or settlement created in a previous month can be reconciled in a later month.
- The audit must distinguish transactions recorded during the selected month from older outstanding transactions cleared during the selected month.
- Finalization may allow acknowledged outstanding transactions because a bank statement can balance while legitimate items remain uncleared.
- Outstanding items must never be silently discarded during finalization.

### 4.9 Time and date handling

- All `DateTime` fields in the reconciliation domain are interpreted in Asia/Manila local time (the homestay's operating timezone). Bank statement dates are entered as local dates without time-of-day.
- A booking payment received at 23:50 and a bank posting at 00:10 the next day are treated as separate calendar days, even when they belong to the same statement line.
- Database columns remain `timestamp(3)` with no timezone conversion at the storage layer; conversion to Asia/Manila happens at the UI and matching layers.

---

## 5. User Roles and Audit Identity

### 5.1 Initial access model

The existing application gives the five owners/managers equal operational access. The first release may continue this model.

All authorized users may:

- View reconciliation data.
- Create and update draft reconciliations.
- Match and unmatch transactions in an open month.
- Create adjustments.
- Finalize a balanced month.
- View finalized reports.

### 5.2 Identity limitation

The current identity picker is attribution rather than strong authentication. Anyone who passes the site-wide access gate can select another user's name.

The UI and reports may display the selected identity, but the product must not describe this as a cryptographically verified signature unless real user authentication is implemented.

### 5.3 Recommended future access model

When Supabase Auth is introduced:

- Persist the authenticated user ID on every audit action.
- Restrict reopening to authorized owners or administrators if role separation is later introduced.
- Preserve the display name at the time of the action so historical reports remain understandable after profile changes.

---

## 6. Information Architecture

### 6.1 Routes

The feature should add:

- `/reconciliation` — active reconciliation workspace
- `/reconciliation/history` — finalized and reopened audit history

The Monthly Audit wizard may be implemented inside `/reconciliation` as a full-screen dialog on desktop and a dedicated full-screen flow on mobile.

### 6.2 Navigation

Desktop navigation should add a primary `Reconciliation` item.

The existing mobile bottom navigation already contains five entries. The application must not squeeze a sixth full-width tab into the current layout without a usability review. Preferred options, in order:

1. Add Reconciliation as a primary tab and move Settings into a `More` menu.
2. Add a `More` tab containing Settings and lower-frequency modules.
3. Keep Reconciliation accessible from the Dashboard and desktop navigation, provided it remains easy to discover.

When the active route is `/reconciliation`, the global mobile bottom navigation should be hidden so it does not collide with the reconciliation control sheet.

---

## 7. Reconciliation Workspace Requirements

### 7.1 Workspace header

The header must display:

- Page title: `Reconciliation`
- Selected working month
- Previous-month and next-month controls
- Live/open, sealed, or reopened status
- `Monthly Audit` action
- Matched-in total for the selected month
- Matched-out total for the selected month
- Unmatched item count and total
- Difference against the statement balance when a draft audit has statement balances

The header must not display a bank selector.

### 7.2 Month behavior

- The default working month is the current month.
- Changing the month updates the matching history, audit draft, lock state, and summary totals.
- Changing the month must not retain stale transaction totals from the previous month.
- Changing the working month should set the default statement date to a valid date in that month, normally the first day or today when viewing the current month.
- Previously selected filters may remain when safe, but entered amounts and selected transaction IDs must be cleared.

### 7.3 Summary metrics

`Matched In` and `Matched Out` must represent all authoritative matches for the selected month, regardless of which user performed them.

They must not be calculated from a per-device or per-user session log.

`Unmatched` must represent eligible outstanding booking payments and expense settlements. It should support separate inflow and outflow counts and totals.

### 7.4 View tabs

The workspace must provide:

- `Uncleared` — items available for matching
- `History` — items matched to the selected month

On mobile, it must also provide:

- `Inflows`
- `Outflows`

The desktop view may display inflows and outflows together or in stacked sections.

### 7.5 Transaction filters

Supported filters:

- Auto
- Bookings
- Expenses
- Refunds
- Adjustments
- Optional date range
- Optional text search by guest, description, reference, confirmation code, payer, or payee

Entering a positive amount in Auto mode filters or prioritizes inflows. Entering a negative amount filters or prioritizes outflows.

### 7.6 Amount input

The workspace must include:

- Peso-formatted amount display
- Numeric keypad
- Decimal input limited to two digits
- Positive/negative toggle
- Clear action
- Backspace action
- Hardware-keyboard support on desktop

Keyboard behavior:

- Digits enter amounts.
- `.` enters a decimal once.
- `-` toggles direction.
- Backspace removes the last character.
- Escape clears the amount.
- Enter performs the current primary action only when that action is unambiguous and valid.

### 7.7 Exact and suggested matching

When an amount is entered:

- Exact absolute-amount matches should be highlighted.
- Direction must also agree.
- One exact candidate may be shown as the primary suggestion.
- Multiple candidates must require the user to select the correct transaction or transactions.
- No exact candidate should expose adjustment creation rather than silently creating a booking or expense.
- Suggested matches may consider reference text and nearby dates, but suggestions must never be committed without user confirmation.

### 7.8 Transaction cards

Each card must display the minimum information required to identify the transaction.

Booking-payment cards:

- Guest name
- Source: Airbnb or Direct
- Amount
- Payment received date
- Booking dates, when useful
- Confirmation code or payment reference
- Paid, partial, overpaid, or refunded context
- Bank-posting date in History view

Expense-settlement cards:

- Expense category
- Description
- Vendor, cleaner, owner, or payee
- Amount
- Expense date
- Actual settlement or reimbursement date
- Bank-posting date in History view

Adjustment cards:

- Category
- Description
- Direction
- Amount
- Effective date
- Bank-posting date
- Creator

### 7.9 Individual matching

Before matching, the user must confirm:

- Selected transaction
- Direction
- Amount
- Statement posting date
- Working month

The server must validate that:

- The period is open or explicitly reopened.
- The transaction still exists.
- The transaction has sufficient unmatched value.
- The match does not exceed the remaining amount unless overmatching is an explicitly supported correction flow.
- No conflicting concurrent match has already consumed the same amount.

Successful matching must atomically create the match and update any derived reconciliation status.

### 7.10 Split and grouped matches

The design must support:

- One booking payment matched to one statement amount.
- Several booking payments matched to one Airbnb payout.
- One expected payment matched across several bank deposits.
- Several expense settlements matched to one bank debit when appropriate.
- Partial matching of a source record.

The match model must store the matched amount rather than assuming the entire source record is consumed.

### 7.11 Batch selection

Batch mode must allow users to select multiple eligible items and display:

- Selected count
- Selected inflow total
- Selected outflow total
- Net selected amount
- Statement posting date

Batch confirmation must clearly state how many records will be matched and the total amount.

Batch actions must be performed transactionally or in safe, retryable chunks without presenting a partial operation as fully successful.

### 7.12 Adjustments

If no legitimate source record matches a bank entry, the primary fallback action must be one of:

- `Add unrecorded deposit`
- `Add bank expense`
- `Create adjustment`

The action must open a form. It must not immediately create a financial record solely from an entered amount.

Required confirmation copy should explain that an adjustment changes the audit ledger and will appear in reports.

### 7.13 Undo and correction

- Open or reopened months permit unmatching.
- Finalized months do not permit ordinary unmatching.
- Undo must remove or reverse the authoritative match in a database transaction.
- The original match and undo event must remain visible in the audit trail.
- An undone item returns to the eligible pool with its remaining amount restored.
- Deleting source bookings or expenses with reconciliation history should be blocked or converted to a reversible archival process.
- Voiding a `BookingPayment` or `ExpenseSettlement` that has one or more active `ReconciliationMatch` rows is rejected unless the caller also reverses the matches in the same transaction. The audit event records both the void and the match reversals.

### 7.14 History view

History must include all source types:

- Booking payments
- Expense settlements
- Guest refunds
- Adjustments

History filters must never accidentally hide a source type because it is already matched.

Each historical record should display who matched it, when it was matched, the bank-posting date, and the matched amount.

---

## 8. Monthly Audit Requirements

### 8.1 Wizard stages

The Monthly Audit wizard consists of five steps:

1. Statement setup
2. Review
3. Verify
4. Finalize
5. Completed/report state

The Period step is not a wizard screen — the workspace's month control (§7.2) already selects the working month before opening the wizard. Opening the wizard always loads the currently selected month, including an existing draft or finalized state.

### 8.2 Pre-wizard month loading

Before the wizard opens and whenever the working month changes inside the wizard:

- Display whether the selected month is open, draft, finalized, or reopened.
- Automatically load an existing draft for an open or reopened month.
- If the month is finalized, open the completed summary in read-only mode rather than loading an obsolete draft. The wizard remains reachable from the summary for users with reopen authority, but the draft state is not re-entered.
- Draft identity is unique per month because the product has one bank account. A finalized period always takes precedence over any stale draft when the same month is opened.

### 8.3 Statement setup stage

Required fields:

- Statement starting balance
- Statement ending balance
- Statement closing date

Optional fields:

- Statement reference or filename
- Notes

Behavior:

- Suggest the previous finalized month's ending balance as the new starting balance.
- Warn if the entered starting balance differs from the previous finalized ending balance.
- Allow zero and negative balances where valid.
- Validate a maximum of two decimal places.
- Persist draft values as exact decimal values.

### 8.4 Review stage

The review pool must include:

- Unmatched transactions created during the selected month.
- Older outstanding transactions that may have cleared during the selected month.
- Booking receipts, expenses, reimbursements, cleaning settlements, refunds, and adjustments.

The statement date selected inside the wizard must be the actual date passed to the match operation. It must not be a cosmetic field disconnected from the write action.

The user must be able to:

- Match individual transactions.
- Select several transactions for a grouped statement entry.
- Create an adjustment.
- Search and filter.
- Return to the main workspace without losing progress.

### 8.5 Verify stage

The authoritative calculation is:

```text
Calculated ending balance =
  statement starting balance
  + reconciled booking receipts
  + reconciled positive adjustments
  - reconciled expense settlements
  - reconciled guest refunds
  - reconciled negative adjustments

Difference =
  calculated ending balance
  - statement ending balance
```

The display must break down:

- Airbnb receipts
- Direct-booking receipts
- Other booking receipts
- Positive adjustments
- Operating expenses
- Cleaning payments
- Owner reimbursements
- Guest refunds
- Bank fees
- Other negative adjustments
- Total inflow
- Total outflow
- Matched item count
- Outstanding item count and value
- Calculated ending balance
- Statement ending balance
- Difference

### 8.6 Balance tolerance

- Persist calculations in integer centavos or exact database decimals.
- The default finalization requirement is an exact zero-centavo difference.
- If a tolerance is later introduced, it must be a named configuration value and must be applied consistently to status display and finalization validation.
- The interface must not display an unresolved difference while simultaneously permitting finalization under a different threshold.

### 8.7 Virtual ledger

The audit must provide a chronological ledger containing:

- Starting balance row
- Bank-posting date
- Source record date
- Transaction type
- Guest, vendor, payee, or description
- Inflow
- Outflow
- Running balance
- Match or adjustment reference

Ordering:

1. Bank-posting date ascending
2. Stable creation or match sequence for entries on the same date

Desktop should use a table. Mobile should use a vertical transaction timeline with the running balance visible per row.

### 8.8 Outstanding-item policy

The application may allow finalization with outstanding items if the bank balance is correct. If this policy is enabled:

- The user must see the outstanding count and value.
- The user must acknowledge that the items remain outstanding.
- The finalized report must preserve an outstanding-item snapshot.
- Outstanding records remain available in later periods.

If the business later requires zero outstanding items, this must become a server-side finalization rule.

### 8.9 Finalization

Finalization must be a single Prisma transaction that:

1. Locks the draft row or otherwise prevents concurrent finalization.
2. Reloads authoritative matches and source records.
3. Recalculates totals on the server.
4. Validates the difference.
5. Validates the period status.
6. Creates an immutable audit snapshot.
7. Marks the period finalized.
8. Archives or removes the active draft state.
9. Writes the finalization audit event.

Client-submitted totals must never be trusted as authoritative.

### 8.10 Finalized state

Once finalized:

- The month becomes read-only for reconciliation changes.
- The report remains viewable and printable.
- The report displays who finalized it and when.
- Opening Monthly Audit for that month must show the finalized report, not an old draft.
- Source records included in the audit cannot be silently deleted or materially changed without reopening or an explicit correction workflow.

### 8.11 Reopening

Reopening requires:

- Confirmation
- Required reason
- Actor identity
- Timestamp

Reopening must:

- Preserve the prior finalized snapshot.
- Increment an audit version number.
- Mark the period `REOPENED` or return it to an editable state with reopen metadata.
- Write an audit event.
- Require a new finalization after corrections.

The history page must allow users to inspect previous finalized versions.

---

## 9. Desktop Experience

### 9.1 Layout

Desktop should follow the approved concept:

- Compact navigation at the far left.
- Dark reconciliation command panel on the left side of the workspace.
- Light transaction repository on the right.
- Summary metrics and Monthly Audit action across the top.

Recommended proportions:

- Command panel: approximately 340–420 pixels wide.
- Transaction area: remaining width.
- Full-height workspace within the viewport.

### 9.2 Command panel

The panel contains:

- Uncleared/History switch
- Batch mode
- Statement date strip
- Filter chips
- Amount display
- Numpad
- Contextual primary action
- Recent session actions or undo history

### 9.3 Transaction area

- Show Expected Inflows first and Expected Outflows second.
- Keep the summary header visible while the list scrolls.
- Use clear emerald treatment for inflows and red/coral treatment for outflows.
- Exact matches receive a noticeable but non-disruptive highlight.
- Cards must remain readable at common laptop widths.

---

## 10. Mobile Experience

### 10.1 Focused route

The reconciliation route should behave like a focused mobile workspace:

- Hide the standard bottom navigation while active.
- Provide an explicit back button.
- Use `100dvh` and safe-area padding.

### 10.2 Sticky header

The mobile header contains:

- Back action
- Reconciliation title
- Month selector
- Live/sealed status
- Compact Monthly Audit action

Summary metrics appear immediately below in horizontally scrollable cards or a compact three-column row.

### 10.3 Transaction list

- Transactions are the primary scrollable content.
- Inflows and outflows use tabs rather than side-by-side columns.
- Entering a positive amount selects or prioritizes Inflows.
- Entering a negative amount selects or prioritizes Outflows.
- Cards must use at least 44-pixel touch targets.
- Important actions cannot depend on hover.

### 10.4 Reconciliation control sheet

The desktop command panel becomes a bottom sheet with three states:

1. Collapsed — statement date, amount, and expand handle
2. Half-open — current suggestion and primary action
3. Expanded — date strip, filters, numpad, and full controls

The collapsed sheet should consume approximately 72–88 pixels plus the device safe area. The expanded sheet may consume approximately 55–70% of the viewport.

The sheet must not obscure the selected transaction without providing its identifying details inside the sheet.

### 10.5 Mobile match suggestion

When there is one strong candidate, display:

- Guest or payee name
- Source or category
- Amount
- Reference
- Date

The action should use specific copy, such as `Match Juan — ₱8,500`, rather than a generic `Confirm` label.

### 10.6 Mobile batch mode

When batch mode is active:

- Hide or minimize the numpad.
- Show selection controls on cards.
- Present a sticky action bar with selected count and total.
- Provide Cancel and Match Selected actions.

### 10.7 Mobile Monthly Audit

The wizard must be full-screen rather than a centered modal.

- Show `Step N of 5` progress.
- Keep Back and Continue actions in a sticky footer.
- Use one primary task per screen.
- Render the virtual ledger as a vertical timeline.
- Ensure the final confirmation cannot be triggered accidentally by ordinary scrolling.

### 10.8 Mobile accessibility and ergonomics

- Minimum interactive target: 44 by 44 CSS pixels.
- Form text size: at least 16 pixels where necessary to avoid iOS zoom.
- Support device safe areas.
- Do not require swipe gestures for essential operations.
- Optional vibration may confirm a successful match but must not be the only feedback.
- Loading and saving states must prevent duplicate submissions.

---

## 11. Proposed Data Model

Exact model names may be refined during implementation, but the following capabilities are required.

### 11.1 BookingPayment

```text
BookingPayment
- id
- bookingId
- amount
- receivedDate
- method
- reference
- notes
- status
- createdBy
- createdAt
- updatedAt
- voidedAt
- voidedBy
```

Suggested payment status:

- `ACTIVE`
- `VOIDED`
- `REFUNDED`

Suggested payment method:

- `AIRBNB_PAYOUT`
- `BANK_TRANSFER`
- `INSTAPAY`
- `CASH_DEPOSIT`
- `OTHER`

### 11.2 ExpenseSettlement

```text
ExpenseSettlement
- id
- expenseId
- amount
- paidDate
- settlementType
- reimbursedTo
- reference
- notes
- createdBy
- createdAt
- updatedAt
- voidedAt
- voidedBy
```

Suggested settlement type:

- `DIRECT_VENDOR_PAYMENT`
- `OWNER_REIMBURSEMENT`
- `CLEANER_PAYMENT`
- `GUEST_REFUND`
- `OTHER`

### 11.3 ReconciliationPeriod

```text
ReconciliationPeriod
- id
- month
- status
- startingBalance
- endingBalance
- calculatedBalance
- difference
- statementClosingDate
- statementReference
- notes
- version
- createdAt
- updatedAt
- finalizedAt
- finalizedBy
- reopenedAt
- reopenedBy
- reopenReason
```

Constraints:

- Unique active period per month.
- Month stored in an unambiguous form, such as first-of-month date or validated `YYYY-MM` string.
- Status values: `DRAFT`, `FINALIZED`, `REOPENED`.

### 11.4 ReconciliationMatch

```text
ReconciliationMatch
- id
- periodId
- sourceType
- sourceId
- direction
- amount
- bankPostedDate
- statementGroupKey
- notes
- matchedAt
- matchedBy
- reversedAt
- reversedBy
- reversalReason
```

Source types:

- `BOOKING_PAYMENT`
- `EXPENSE_SETTLEMENT`
- `ADJUSTMENT`

Direction values:

- `INFLOW`
- `OUTFLOW`

`statementGroupKey` allows several source records to represent one statement line without requiring a bank-statement import in the first release. The key is a server-generated ULID minted when the first match in a group is created; subsequent matches in the same group reuse it. The value is opaque to the user and surfaces in the UI as the human-readable statement description.

Constraints and indexes:

- Index on `(periodId, sourceType, sourceId)` where `reversedAt IS NULL`, to make the
  "how much of this source is already matched" read fast.
- **This is deliberately not a unique index.** An earlier draft of this spec asked for a
  partial unique constraint on `(periodId, sourceType, sourceId)` where `reversedAt IS NULL`,
  which directly contradicts §7.10: "one expected payment matched across several bank
  deposits" and "partial matching of a source record" both require two live matches against
  the same source row in the same period. A unique constraint there would make split
  matching impossible to record.
  Double-consumption is prevented by §14's mechanism instead — the available amount is
  re-read inside the write transaction and validated before the insert, so concurrent
  attempts give one success and one clear conflict. The index is for read performance;
  correctness comes from the transaction.
- Index on `(periodId, bankPostedDate)` for ledger ordering.

### 11.5 ReconciliationAdjustment

```text
ReconciliationAdjustment
- id
- periodId
- direction
- category
- status (ACTIVE | VOIDED)
- amount
- effectiveDate
- bankPostedDate
- description
- createdBy
- createdAt
- updatedAt
- voidedAt
- voidedBy
```

The `status` enum mirrors `BookingPayment` and `ExpenseSettlement` so all three source models expose the same voiding contract; reconciliation queries filter on `status = 'ACTIVE'` rather than `voidedAt IS NULL` for consistency.

### 11.6 ReconciliationSnapshot

Finalization should preserve an immutable snapshot rather than relying exclusively on later reconstruction from mutable source records.

```text
ReconciliationSnapshot
- id
- periodId
- version
- summaryJson
- ledgerJson
- outstandingJson
- finalizedAt
- finalizedBy
```

The snapshot may be normalized into additional tables if preferred, but it must preserve the finalized values and ledger even if a guest name or description changes later.

### 11.7 ReconciliationAuditEvent

```text
ReconciliationAuditEvent
- id
- periodId
- eventType
- actor
- timestamp
- reason
- metadataJson
```

Event types should include:

- `DRAFT_CREATED`
- `MATCH_CREATED`
- `MATCH_REVERSED`
- `ADJUSTMENT_CREATED`
- `ADJUSTMENT_VOIDED`
- `PERIOD_FINALIZED`
- `PERIOD_REOPENED`
- `PERIOD_REFINALIZED`

---

## 12. Existing-Model Integration

### 12.1 Booking payment status

The booking `paymentStatus` is derived from active `BookingPayment` totals and persisted as a cached column updated transactionally with payment changes.

Status mapping:

- `PENDING` — zero active payments.
- `PARTIAL` — at least one active payment, received less than `totalPayout`.
- `PAID` — received within the configured centavo tolerance of `totalPayout`.
- `OVERPAID` — received exceeds `totalPayout`. The homestay must investigate and either refund the excess (an `ExpenseSettlement` of type `GUEST_REFUND`) or record an `Adjustment` explaining the overage; reconciliation surfaces `OVERPAID` on the booking card until either path is taken.

The cached column exists only to avoid aggregate queries on every booking list render. Reconciliation must always recompute the value from authoritative payment rows and must surface the cache versus derived value in any debug view. The `PaymentStatus` enum gains the `OVERPAID` value alongside the existing `PAID | PENDING | PARTIAL`.

### 12.2 Existing paid bookings migration

For existing bookings marked paid:

- Do not invent an exact receipt date silently.
- Provide a migration or setup workflow that asks for or assigns an explicit opening treatment.
- Possible strategies:
  - Create legacy booking payments dated using a reviewed import date.
  - Mark pre-reconciliation history as an opening-balance adjustment.
  - Start formal reconciliation from a chosen month and treat all prior history as included in the opening balance.

The recommended approach is to choose a reconciliation start month and use a verified opening balance, avoiding fabricated historical bank dates.

### 12.3 Existing expenses migration

- Expenses marked `refunded` currently imply money is no longer owed, but do not prove when the bank outflow occurred.
- Historical expenses should not automatically receive fabricated settlement dates.
- The reconciliation start-month process should define whether older settled expenses are included in the opening balance or entered as outstanding settlements.

### 12.4 Cleaning integration

- Existing linked cleaning expenses remain the expense source.
- Only one settlement path may create the bank outflow.
- Updating or deleting a cleaning must not orphan a finalized reconciliation record.

---

## 13. Server-Side Operations

The implementation should expose server-side operations equivalent to:

- List reconciliation workspace data for a month
- Create/update booking payment
- Void booking payment
- Create/update expense settlement
- Void expense settlement
- Load or create monthly draft
- Update statement setup
- Create match
- Create grouped matches
- Reverse match
- Create adjustment
- Void adjustment
- Finalize month
- Reopen month
- List audit reports
- Load immutable report version

Every write operation must call the existing site-access guard and must validate period status on the server.

The client store may use the application's existing refresh-after-write pattern, but successful writes must not be reported as failures merely because a subsequent refresh failed.

---

## 14. Concurrency and Integrity

- Matching and unmatching must use Prisma transactions.
- Finalization must use a Prisma transaction.
- The server must recalculate available unmatched amounts immediately before writing.
- Concurrent attempts to consume the same amount must result in one success and one clear conflict response.
- A unique constraint or optimistic version field should prevent duplicate finalization.
- Draft updates should use an `updatedAt` or version check when simultaneous editors are possible.
- Reports must not depend solely on client-calculated totals.
- Source deletions must respect finalized audit references.
- Financial rows should normally be voided rather than hard-deleted after they have appeared in audit history.

---

## 15. Draft Persistence

- Drafts save automatically when statement setup changes and when the wizard advances.
- `Save and Exit` must explicitly persist the current stage.
- Draft save errors must be visible; silent failure is not acceptable for audit data.
- Finalization must archive or supersede the draft.
- The finalized report takes precedence over any stale draft when opening the same month.
- Reopening creates a new editable version based on the last finalized snapshot rather than reviving an unrelated stale draft.

---

## 16. Reports and Export

### 16.1 Audit history page

The history page must support:

- Month search
- Status filter
- Finalizer search
- Newest-first ordering
- Balanced/reopened status indicators
- Access to previous versions

### 16.2 Audit report

Each report must contain:

- ACs Homestay identification
- Audit month
- Statement starting balance
- Statement ending balance
- Calculated ending balance
- Difference
- Total inflows and breakdown
- Total outflows and breakdown
- Matched count
- Outstanding count and total
- Chronological ledger
- Outstanding-item list
- Adjustments
- Finalized by and finalized timestamp
- Reopen/refinalize history, when applicable
- Audit ID and version

### 16.3 Printing

- Provide a print-friendly report without application navigation.
- Use readable PHP formatting and page-break behavior.
- Repeat table headings on new printed pages when supported.
- Ensure report totals are visible without relying on color alone.

### 16.4 CSV export

Exports should include:

- Monthly audit summary
- Ledger rows
- Outstanding items
- Adjustments
- Audit events

The existing export menu may be extended with reconciliation exports.

---

## 17. Visual Design Requirements

The reconciliation feature should follow the approved concept and the existing ACs Homestay design language.

Recommended palette:

- Warm white or pale sand page background
- Deep navy command surface
- Emerald green for inflows and successful balance state
- Coral or restrained red for outflows and discrepancies
- Amber for primary audit actions and attention states
- Slate for neutral text

Design principles:

- Rounded cards and controls consistent with the current application
- Clear financial hierarchy
- Strong but restrained amount colors
- High contrast on the dark command panel
- Minimal decorative elements inside dense transaction areas
- No bank selector
- No church-specific terminology
- No `Cash`, `Online`, or `Transfer` mode names from the reference implementation unless they become real homestay requirements

---

## 18. Accessibility Requirements

- Meet WCAG 2.1 AA contrast targets where practical.
- Do not communicate inflow/outflow or balanced/unbalanced status through color alone.
- All icon-only buttons require accessible labels.
- Keyboard navigation must reach every desktop action.
- Modal and full-screen wizard focus must be trapped and restored correctly.
- Confirmation messages must be announced to assistive technology.
- Transaction cards used as buttons must use semantic interactive elements.
- Respect reduced-motion preferences.
- Currency and signed amounts must have understandable screen-reader labels.

---

## 19. Error Handling

Required user-facing errors include:

- Source transaction no longer exists.
- Transaction was already matched by another user.
- Match amount exceeds the remaining amount.
- Month was finalized while the screen was open.
- Draft could not be saved.
- Finalization failed without committing any changes.
- Period was finalized but the refreshed report could not be loaded.
- Network connection was interrupted.
- Adjustment or match could not be reversed.

Error messages must state whether the underlying write succeeded. The application must not encourage a retry when doing so could create a duplicate.

---

## 20. Performance Requirements

- Initial workspace load should remain responsive for several thousand historical transactions.
- Query only the selected period's matches plus eligible outstanding transactions.
- Paginate or virtualize long histories if needed.
- Avoid loading receipt or payment-proof binary data with list queries.
- Recalculate summaries on the server or via efficient aggregate queries.
- Mobile scrolling must remain smooth while the control sheet is present.
- The numpad and amount filtering should respond immediately without a server round trip.

---

## 21. Security Requirements

- Every server action must call `requireSiteAccess()` or its authenticated successor.
- Finalization and reopening rules must be enforced server-side.
- The client must not be able to submit authoritative totals.
- Statement notes and descriptions must be treated as untrusted text.
- Export endpoints must require site access.
- Avoid exposing payment screenshots or ID photos through reconciliation queries.
- Audit snapshots must not contain unnecessary guest identity data beyond what is needed to identify the financial record.

---

## 22. Testing Requirements

### 22.1 Unit tests

Test exact-centavo calculations for:

- Booking payment totals
- Partial payments
- Overpayments
- Expense settlement totals
- Owner reimbursement timing
- Inflow/outflow classification
- Adjustment classification
- Running balance
- Difference calculation
- Previous-month outstanding items
- Zero and negative starting balances

### 22.2 Server-action and integration tests

Test:

- Individual match
- Grouped match
- Split match
- Partial match
- Reverse match
- Concurrent matching conflict
- Adjustment creation and voiding
- Finalization transaction rollback
- Finalized-period write rejection
- Reopening and refinalization
- Draft precedence versus finalized summary
- Source deletion protection

### 22.3 UI tests

Test desktop and mobile flows:

- Exact match from numpad
- Multiple-candidate selection
- No-match adjustment flow
- Positive/negative mode changes
- Batch selection
- Mobile control-sheet states
- Monthly Audit navigation
- Statement date reaching the actual match operation
- Finalization disabled for a non-zero difference
- Finalized month opening in read-only report mode

### 22.4 Regression tests

Add tests specifically preventing:

- Stale totals after changing month
- Old drafts overriding finalized reports
- Exactly one cent passing an exact-zero rule
- History hiding matched refunds or adjustments
- Per-user session totals being displayed as authoritative month totals
- Older outstanding items disappearing from the review pool

---

## 23. Observability and Auditability

- Log reconciliation server errors with operation type and period ID without logging sensitive attachments.
- Preserve business audit events in the database independently of application logs.
- Include stable IDs in support-facing error messages where helpful.
- Track finalization duration and failure reason for troubleshooting.
- Detect and report snapshot/summary inconsistencies if reconstruction tools are added later.

---

## 24. Migration and Rollout Plan

### Phase 1: Financial-event foundation

- Add booking-payment records.
- Add expense-settlement records.
- Update booking and expense interfaces to capture actual payment dates.
- Decide and document the formal reconciliation start month.
- Establish the verified opening balance.

### Phase 2: Reconciliation workspace

- Add month selection and status.
- Add inflow and outflow pools.
- Add amount input, exact suggestions, matching, grouped matching, history, and undo.
- Add adjustments.
- Add mobile bottom-sheet controls.

### Phase 3: Monthly Audit

- Add drafts and statement setup.
- Add review and verification.
- Add virtual ledger.
- Add atomic finalization and locking.
- Add finalized report.

### Phase 4: History and hardening

- Add report history and versions.
- Add reopen/refinalize workflow.
- Add CSV exports and print layout.
- Complete accessibility, concurrency, and regression testing.

### Optional Phase 5: Statement import

- Import supported bank CSV format.
- Deduplicate imported statement lines.
- Suggest exact and grouped matches.
- Preserve manual workflow when import is unavailable.

---

## 25. Acceptance Criteria

The first production release is acceptable when all of the following are true:

1. A user can record multiple and partial payments for a booking.
2. A user can record when an expense actually leaves the homestay bank.
3. The workspace lists eligible outstanding inflows and outflows, including older outstanding records.
4. A user can match one source record, multiple records, or part of a record.
5. Exact amount suggestions never bypass explicit confirmation.
6. Unexplained bank movements are recorded as explicit adjustments.
7. Desktop presents the approved command-panel and transaction-pool layout.
8. Mobile presents a focused transaction list with a collapsible reconciliation bottom sheet.
9. The mobile route does not conflict with the global bottom navigation.
10. Monthly Audit saves and restores drafts correctly.
11. The statement date selected in the audit is the date used by the match write.
12. Verification uses exact centavo calculations.
13. A non-zero difference cannot be finalized under an exact-zero policy.
14. Finalization recalculates totals on the server and commits atomically.
15. Finalization locks the selected month.
16. A finalized month opens its report instead of an obsolete draft.
17. Reopening requires a reason and preserves the earlier finalized version.
18. The report includes a chronological ledger and outstanding-item snapshot.
19. Authoritative totals include all users' matches, not only the current user's session.
20. Unit, integration, responsive UI, and regression tests pass.

---

## 26. Locked Implementation Decisions

The following decisions were resolved during the spec review pass and are now requirements:

1. **First reconciled period.** Reconciliation begins **1 November 2026**, the first day of the month after go-live. The owner confirms the verified opening balance from that day's bank statement before any workspace interaction begins. No historical reconciliation backfill is performed; older payments and settlements either enter via the opening balance or are excluded.

   This was decided on 2026-10-14, superseding the earlier "first day of the current calendar month" wording. October 2026 deliberately closes with no audit at all, so nothing can be reconciled retroactively against it. Everything already in the database — 85 expenses, 30 cleanings, 32 bookings, and the 0 booking payments and 0 settlements recorded so far — sits before the start month and is absorbed by the opening balance rather than backfilled with invented receipt dates (§12.2).

   Nothing in the code encodes this date: the workspace's month stepper is unbounded and defaults to the current month, so November is reached by stepping forward once. The start month is an operational decision recorded here, not a configuration value.
2. **Outstanding items at finalization.** Allowed under the §8.8 policy. The user must acknowledge the count and value at finalization, and the finalized report preserves an outstanding-item snapshot. If business policy later requires zero outstanding, the change becomes a server-side finalization rule.
3. **Marking a booking paid.** Requires at least one `BookingPayment` record. The cached `paymentStatus` reflects this and exposes `OVERPAID` when received exceeds `totalPayout` (see §12.1).
4. **Marking a cleaning paid.** Creates an `ExpenseSettlement` of type `CLEANER_PAYMENT` and prompts for the actual bank-posting date (see §4.6).
5. **Owner reimbursements.** Remain a settlement type (`OWNER_REIMBURSEMENT`) on `ExpenseSettlement`. No separate reimbursement model.
6. **Identity for the first release.** Use the existing identity-picker attribution per §5.2. Reconciliation data carries the selected display label as `createdBy` / `matchedBy` / `finalizedBy` / etc. Supabase Auth becomes the source of truth in a later phase; the audit-trail shape is preserved across that transition.
7. **Bank CSV import.** Remains optional Phase 5. No bank format is committed to at this point.

---

## 27. Definition of Done

The feature is complete when:

- Schema migrations are reviewed and safely deployable.
- Existing booking, expense, cleaning, and dashboard behavior remains correct.
- Reconciliation calculations are covered by automated tests.
- Desktop and mobile implementations match the approved responsive concept.
- Finalization and reopening are protected by server-side rules.
- A real month can be reconciled from opening balance through printed report without manual database intervention.
- Operational documentation explains payment entry, matching, adjustments, finalization, and reopening to the owners/managers.

