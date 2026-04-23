# Opportunity Intake — AI Automation

## What this is
End-to-end automation of the talabat Product & Tech Opportunity Intake process. Replaces manual triage, stakeholder assignment, and notification with an AI-powered pipeline.

## Current Status

| # | Component | Status | How it works |
|---|-----------|--------|-------------|
| 1 | **Presentation Deck** | Done | `index.html` — 9-section HTML deck with pipeline, scoring, OKR mapping, bot flow |
| 2 | **Slack DM Bot** | Done | Apps Script, hourly trigger, 8 message templates. Sends DMs to submitters when status changes |
| 3 | **Classify** (New Bet vs Optimization) | In progress | AI reads description → classifies. Optimizations get OKR mapping; New Bets go to council |
| 4 | **Detect unassigned rows** | In progress | Scans 6 bet tabs for Status = "NEW" or empty |
| 5 | **Quality evaluation** | In progress | Checks 4 required fields: Description, Impact, Metric, Documents |
| 6 | **Auto-assign stakeholders** | In progress | Fills CBO + Product Tribe from Intake Council mapping |
| 7 | **OKR mapping** | In progress | Matches optimization keywords to 10 Q2 2026 P&T objectives |
| 8 | **Auto-set status** | In progress | Quality PASS → "Ready for Review", FAIL → "Needs Clarification" |
| 9 | **Interactive replies** | Not started | Submitter replies to bot DM → bot writes comments in Sheet |
| 10 | **Scoring engine** | Designed | 3 dimensions (Strategic 50%, Confidence 30%, Priority 20%) — in deck, not yet coded |

## How the pipeline works

```
New submission lands in Intake Sheet (any of 6 bet tabs)
        │
        ▼
   ┌─────────────┐
   │  Detect NEW  │  Scan for Status = "NEW" or empty
   │    rows      │
   └──────┬──────┘
          ▼
   ┌─────────────┐
   │  Classify    │  New Bet vs Optimization (AI judgment)
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
│ CBO +  │  │ (list missing      │
│ Tribe  │  │  fields in DM)     │
└───┬────┘  └────────┬──────────┘
    │                │
    ▼                │
┌────────┐           │
│ OKR    │           │
│ Map    │ (optim.   │
│        │  only)    │
└───┬────┘           │
    │                │
    ▼                ▼
┌────────────────────────┐
│  Set Status in Sheet   │  "Ready for Review" or "Needs Clarification"
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│  Intake Bot detects    │  Hourly Apps Script trigger
│  status change → DM   │  Sends Slack DM to submitter
└────────────────────────┘
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

## Scoring dimensions (designed, not yet coded)

| Dimension | Weight | 5 = Best | 1 = Worst |
|-----------|--------|----------|-----------|
| Strategic Impact | 50% | GMV > €10M or critical compliance | No quantified impact |
| Confidence Level | 30% | Full BC with validated data | No data, conceptual only |
| Business Priority | 20% | Multi-market / regulatory | Sub-functional nice-to-have |

**Formula**: `(Strategic × 0.5) + (Confidence × 0.3) + (Priority × 0.2)` → score out of 5.0

## Tech stack

- **Presentation**: Single-file HTML (`index.html`), talabat brand colors, no framework
- **Slack Bot**: Google Apps Script (`Code.gs`), `chat.postMessage` API, hourly trigger
- **Triage Pipeline**: Claude Code skill (MCP tools), reads/writes Google Sheets directly
- **No Python, no servers, no databases** — everything runs through Google Sheets + Slack APIs

## File structure

```
opportunity-intake-deck/
├── index.html          # Presentation deck (9 sections)
├── assets/
│   └── talabat-logo.png
└── README.md           # This file
```
