# Opportunity Intake — AI Automation

## What this is
End-to-end automation of the talabat Product & Tech Opportunity Intake process. Replaces manual triage, stakeholder assignment, and notification with an AI-powered pipeline.

## Current Status

| # | Component | Status | How it works |
|---|-----------|--------|-------------|
| 1 | **Presentation Deck** | Done | `index.html` — 9-section HTML deck with pipeline, scoring, OKR mapping, bot flow |
| 2 | **Slack DM Bot** | Done | Apps Script, hourly trigger, 8 message templates. Sends DMs to submitters when status changes |
| 3 | **Classify** (New Bet vs Optimization) | Done | AI reads description → classifies. Optimizations get OKR mapping; New Bets go to council |
| 4 | **Detect unassigned rows** | Done | Scans 6 bet tabs for Status = "NEW" or empty |
| 5 | **Quality evaluation** | Done | Checks 4 required fields: Description, Impact, Metric, Documents |
| 6 | **Auto-assign stakeholders** | Done | Fills CBO + Product Tribe from Intake Council mapping |
| 7 | **OKR mapping** | Done | Matches optimization keywords to 10 Q2 2026 P&T objectives |
| 8 | **Auto-set status** | Done | Quality PASS → "Ready for Review", FAIL → "Needs Clarification" |
| 9 | **Interactive replies** | Not started | Submitter replies to bot DM → bot writes comments in Sheet |
| 10 | **Scoring engine** | Done | 3 dimensions (Strategic 50%, Confidence 30%, Priority 20%) — skill `intake-score`, writes to columns S–X |

## End-to-end flow

When someone submits a new opportunity, here's what happens:

### Step 1 — Submission
Someone fills in a row on one of the 6 bet tabs in the Intake Sheet. Status is blank or "NEW".

### Step 2 — Triage (skill: `intake-triage`)
1. **Classify** — AI reads the description and decides: New Bet or Optimization
2. **Quality gate** — checks 4 required fields:
   - Description (50+ characters)
   - Impact (contains a number or quantified estimate)
   - Metric (names a real metric: GMV, MAU, NCR, etc.)
   - Related Documents (has a URL or explicitly says "NA")
3. **If all 4 pass** → auto-assigns CBO + Product Tribe from the Intake Council mapping, sets status to **"Ready for Review"**
4. **If any fail** → sets status to **"Needs Clarification"**, lists which fields need fixing
5. If classified as Optimization → maps to the matching Q2 2026 P&T OKR (informational, not written to sheet)

### Step 3 — Bot notification (automatic, hourly)
The Slack bot detects the status change and DMs the submitter:
- **Ready for Review** → tells them it's queued for council, who's assigned, when next intake session is
- **Needs Clarification** → tells them exactly which fields to fix

### Step 4 — Scoring (skill: `intake-score`)
For rows that passed triage ("Ready for Review"), AI scores on 3 weighted dimensions:
- **Strategic Impact (50%)** — how big is the business impact (GMV, compliance, etc.)
- **Confidence Level (30%)** — how solid is the supporting evidence (BC, data, A/B tests)
- **Business Priority (20%)** — how broad is the scope (multi-market vs single team)

Writes scores to columns S–X: 3 sub-scores (1–5), total out of 5.0, tier, and a 1-line rationale.

**Auto-assigned tiers:**
- **Prioritize** (>= 4.0) — strong case, recommend council approval
- **Discuss** (2.5–3.9) — needs council review and discussion
- **Defer** (< 2.5) — lower priority, next quarter or deprioritize

### Step 5 — Intake Council (manual)
Council reviews scored submissions and sets status to one of:
- **Accepted** — approved, moves to product team
- **Rejected** — declined with reason
- **Backlog** — parked for future consideration
- **Product Review** — needs deeper product assessment
- **Fast-Track** — manual override for urgent requests (independent of score)

### Step 6 — Bot notifies outcome (automatic)
Whatever the council decides, the bot picks up the status change and DMs the submitter with the result.

### Flow diagram

```
Submission lands in Intake Sheet (any of 6 bet tabs)
        │
        ▼
   ┌─────────────┐
   │  Detect NEW  │  Scan for Status = "NEW" or empty
   │    rows      │
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │  Classify    │  New Bet vs Optimization
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │  Quality     │  Check: Description, Impact, Metric, Docs
   │  Evaluate    │
   └──────┬──────┘
          │
    ┌─────┴─────┐
    ▼           ▼
  PASS        FAIL
    │           │
    ▼           ▼
┌────────┐  ┌──────────────────┐
│ Assign │  │ Needs Clarification│
│ CBO +  │  │ (bot DMs submitter │
│ Tribe  │  │  with missing fields)│
└───┬────┘  └──────────────────┘
    │
    ▼
┌────────┐
│ OKR    │  (optimizations only)
│ Map    │
└───┬────┘
    │
    ▼
┌──────────────────────────┐
│  Status → Ready for Review│
└───────────┬──────────────┘
            ▼
┌──────────────────────────┐
│  Bot DMs submitter       │  Hourly trigger
└───────────┬──────────────┘
            ▼
┌──────────────────────────┐
│  Score (3 dimensions)    │  Strategic + Confidence + Priority
│  Assign tier             │  Prioritize / Discuss / Defer
└───────────┬──────────────┘
            ▼
┌──────────────────────────┐
│  Intake Council reviews  │  Manual decision
│  Sets final status       │  Accepted / Rejected / Backlog /
│                          │  Product Review / Fast-Track
└───────────┬──────────────┘
            ▼
┌──────────────────────────┐
│  Bot DMs submitter       │  Final outcome notification
└──────────────────────────┘
```

## Key resources

| Resource | Link |
|----------|------|
| Intake Sheet | [Google Sheets](https://docs.google.com/spreadsheets/d/1bYw6ise5wWpIrAviP5OTNdONIF0fVC5wIPPzKgHV900/edit) |
| Intake Bot (Apps Script) | [Script Editor](https://script.google.com/d/1Bx7TVmhrF0May7SA1i8i5bbiVvOcioDDZqoZR3g2sL7PfdAO9j0h_VnR/edit) |
| Slack channel | `#tlb_opportunityintake_product` |
| Process doc | [Google Doc](https://docs.google.com/document/d/1o4uxHcPzfdI1e_e5FRga7Mn07f2JPJBHa5LhfTNPHq8/edit) |

## Stakeholder mapping (per bet tab)

| Bet Tab | CBO | Product Tribe |
|---------|-----|---------------|
| 1/ Choice | Kedar Kulkarni | Tony Fadel |
| 2/Experience | Khee Lim | Rose Marsh |
| 3/Value | Alvaro Martinez Espinosa | Rose Marsh |
| 4/Ecosystem & Growth | Hussein Daher | Emily Thomas |
| 5/Foundations | Sofia Simoes de Almeida | Sofia Simoes de Almeida |

## Quality gate (4 required fields)

| Field | Column | Pass criteria |
|-------|--------|--------------|
| Description | G | 50+ chars, at least 2 sentences |
| Impact | I | Contains a number or estimate (not empty/"-") |
| Metric | J | Named metric (GMV, MAU, NCR, etc.) |
| Documents | L | URL or explicit "NA"/"nil" |

**All 4 must pass** → "Ready for Review". Any fail → "Needs Clarification" with specific fields listed in the DM.

## Scoring (skill: `intake-score`, columns S–X)

| Dimension | Weight | 5 = Best | 1 = Worst |
|-----------|--------|----------|-----------|
| Strategic Impact | 50% | GMV > €10M or critical compliance | No quantified impact |
| Confidence Level | 30% | Full BC with validated data | No data, conceptual only |
| Business Priority | 20% | Multi-market / regulatory | Sub-functional nice-to-have |

**Formula**: `(Strategic × 0.5) + (Confidence × 0.3) + (Priority × 0.2)` → score out of 5.0

**Auto-assigned tiers**: Prioritize (>= 4.0) | Discuss (2.5–3.9) | Defer (< 2.5)

**Fast-Track** is a manual council decision for urgent requests — not score-based, never auto-assigned.

## Tech stack

- **Presentation**: Single-file HTML (`index.html`), talabat brand colors, no framework
- **Slack Bot**: Google Apps Script (`Code.gs`), `chat.postMessage` API, hourly trigger
- **Triage Pipeline**: Claude Code skill (`intake-triage`), reads/writes Google Sheets via MCP
- **Scoring Engine**: Claude Code skill (`intake-score`), scores and writes to columns S–X via MCP
- **No Python, no servers, no databases** — everything runs through Google Sheets + Slack APIs

## File structure

```
opportunity-intake-deck/
├── index.html          # Presentation deck (9 sections)
├── assets/
│   └── talabat-logo.png
└── README.md           # This file
```
