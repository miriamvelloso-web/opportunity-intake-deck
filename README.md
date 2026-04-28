# Opportunity Intake — AI Automation

## What this is
End-to-end automation of the talabat Product & Tech Opportunity Intake process. Replaces manual triage, stakeholder assignment, scoring, and notification with an AI-powered pipeline.

## Current Status

| # | Component | Status | How it works |
|---|-----------|--------|-------------|
| 1 | **Presentation Deck** | Done | `index.html` — 9-section HTML deck with pipeline, scoring, OKR mapping, bot flow |
| 2 | **Slack Channel Bot** | Done | Apps Script, hourly trigger, posts to `#tlb_opportunityintake_product` channel threads with @mentions |
| 3 | **Classify** (New Bet vs Optimization) | Done | AI reads description → classifies. Optimizations get OKR mapping; New Bets go to council |
| 4 | **Detect unassigned rows** | Done | Scans 6 bet tabs for Status = "NEW" or empty |
| 5 | **Quality evaluation** | Done | Checks 4 required fields: Description, Impact, Metric, Documents |
| 6 | **Auto-assign stakeholders** | Done | Fills CBO + Product Tribe from Intake Council mapping |
| 7 | **OKR mapping** | Done | Matches optimization keywords to 10 Q2 2026 P&T objectives |
| 8 | **Auto-set status** | Done | Quality PASS → "Ready", FAIL → "Needs Clarification" |
| 9 | **Thread reply capture** | Done | Submitter replies in Slack thread → bot captures reply as cell note on sheet |
| 10 | **Scoring engine** | Done | 3 dimensions (Strategic 50%, Confidence 30%, Priority 20%) — auto-scores "Ready" rows |
| 11 | **Auto-triage** | Done | Embedded in hourly bot: triage NEW rows → score Ready rows → detect changes → post to channel |

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
   │  Quality     │  Check: Description ≥50 chars, Impact has number,
   │  Evaluate    │  Metric named, Docs has URL or NA
   └──────┬──────┘
          │
    ┌─────┴─────┐
    ▼           ▼
  PASS        FAIL
    │           │
    ▼           ▼
┌────────┐  ┌──────────────────────┐
│ Assign │  │ Needs Clarification  │
│ CBO +  │  │ (specific missing    │
│ Tribe  │  │  fields in message)  │
└───┬────┘  └────────┬─────────────┘
    │                │
    ▼                │
┌────────┐           │
│ Score  │           │
│ (3 dim)│           │
└───┬────┘           │
    │                │
    ▼                ▼
┌────────────────────────────┐
│  Post to Slack channel     │  One thread per initiative
│  thread with @submitter    │  Replies captured back to sheet
└────────────────────────────┘
```

## Key resources

| Resource | Link |
|----------|------|
| Intake Sheet | [Google Sheets](https://docs.google.com/spreadsheets/d/1bYw6ise5wWpIrAviP5OTNdONIF0fVC5wIPPzKgHV900/edit) |
| Intake Bot (Apps Script) | [Script Editor](https://script.google.com/d/1Bx7TVmhrF0May7SA1i8i5bbiVvOcioDDZqoZR3g2sL7PfdAO9j0h_VnR/edit) |
| Slack channel | `#tlb_opportunityintake_product` (C03TZK6G4P8) |
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
| Description | G | 50+ chars |
| Impact | I | Contains a number or estimate (not empty/"-") |
| Metric | J | Named metric (GMV, MAU, NCR, etc.) |
| Documents | L | URL or explicit "NA"/"nil" |

**All 4 must pass** → "Ready". Any fail → "Needs Clarification" with specific fields listed in the channel thread.

## Scoring dimensions (calibrated from P&T OKR actuals)

Strategic Impact thresholds are calibrated against actual annual impact data from P&T OKR Key Results (Q3–Q1 Y25–Y26, median €7.6M).

| Dimension | Weight | 5 = Best | 1 = Worst |
|-----------|--------|----------|-----------|
| Strategic Impact | 50% | Annual impact > €15M or critical regulatory | Annual impact < €1M or not quantified |
| Confidence Level | 30% | Full BC with validated data | No data, conceptual only |
| Business Priority | 20% | Multi-market / regulatory | Sub-functional nice-to-have |

| Score | Strategic Impact Band |
|-------|----------------------|
| 5 | > €15M |
| 4 | €7M – €15M |
| 3 | €3M – €7M |
| 2 | €1M – €3M |
| 1 | < €1M |

**Formula**: `(Strategic × 0.5) + (Confidence × 0.3) + (Priority × 0.2)` → score out of 5.0

**Tiers**: ≥4.0 Prioritize | ≥2.5 Discuss | <2.5 Defer

## Tech stack

- **Presentation**: Single-file HTML (`index.html`), talabat brand colors, no framework
- **Slack Bot**: Google Apps Script (`Code.gs`), `chat.postMessage` API, hourly trigger, channel threads
- **Triage + Scoring**: Embedded in Apps Script bot (auto-triage, heuristic scoring) + Claude Code skills for manual runs
- **Reply capture**: `conversations.replies` API reads submitter replies from Slack threads → writes to sheet as cell notes
- **No Python, no servers, no databases** — everything runs through Google Sheets + Slack APIs

## Bot scopes required

| Scope | Purpose |
|-------|---------|
| `chat:write` | Post messages to channel |
| `channels:history` | Read thread replies |
| `users:read` | Resolve submitter names to IDs for @mentions |

## File structure

```
opportunity-intake-deck/
├── index.html              # Presentation deck (9 sections)
├── assets/
│   └── talabat-logo.png
├── intake-bot/
│   ├── Code.gs             # Apps Script bot (triage, score, notify, reply capture)
│   ├── appsscript.json     # Apps Script manifest + scopes
│   └── .clasp.json         # clasp config (script ID for push/pull)
└── README.md               # This file
```

## Deploying the bot

```bash
cd intake-bot
clasp push --force          # Push Code.gs to Apps Script
```

In the Apps Script editor:
1. Run `setup()` — stores Slack bot token
2. Run `checkIntakeStatuses()` — bootstrap (snapshots rows, no messages)
3. Run `checkIntakeStatuses()` again — live run (triage + score + notify)
4. Run `createHourlyTrigger()` — sets up hourly auto-run
