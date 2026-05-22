# 显影 · Unearth

**A memory excavation tool for photographers**

> *You are not organizing files. You are choosing what memories to carry forward.*

[![Status](https://img.shields.io/badge/status-active%20development-amber)](https://github.com/rickyke2023-ctrl/unearth)
[![Version](https://img.shields.io/badge/version-v0.2.0-blue)](https://github.com/rickyke2023-ctrl/unearth/releases)
[![Stack](https://img.shields.io/badge/stack-React%20%2B%20FastAPI-blueviolet)]()

---

## What it looks like

![Excavation — untouched soil](SCREENSHOTS/excavation_soil_untouched.png)

*Today's Excavation — a photo buried beneath geological layers. Scrub the soil to reveal it.*

![Excavation — mid reveal](SCREENSHOTS/excavation_mid_reveal.png)

*As you scrub, the photo emerges from darkness. The further you dig, the more it surfaces.*

![Excavation — fully revealed](SCREENSHOTS/excavation_fully_revealed.png)

*Fully revealed. Now decide: carry it forward, or leave it here.*

---

![Site View — shooting events](SCREENSHOTS/siteview_events.png)

*Site View — your month as an excavation site. Each card is a shooting event, grouped automatically.*

![Strata View — your years as geological layers](SCREENSHOTS/20260520_2107_StrataView_redesign.png)

*Strata View — every year a geological layer, every month a block proportional to photo count.*

![Decision View — classic mode](SCREENSHOTS/decisionview_classic.png)

*Decision View — classic batch mode with Polaroid queue, memory capsule, and context card.*

---

## The problem it solves

Four years. Three countries. 40,000 photos. 900GB.

Most photographers with this kind of backlog have tried Lightroom, Apple Photos, and every sorting tool — and given up. Because the problem isn't the tool. It's that organizing photos feels like doing chores, not like reliving memories.

**Unearth reframes the whole thing:**
- Not "delete" — "leave here" (it stays in time, just not in your story)
- Not "save" — "carry forward" (an active choice, not passive accumulation)
- Not a task to complete — a ritual to experience

---

## Core experience: Today's Excavation

Every day, the app surfaces 10 photos from the same calendar date across different years — your May 21st from 2020, 2021, 2022, 2023, all together.

Scrub away the soil with your mouse. Hear the sound of digging. Watch the photo emerge from darkness. When it's fully revealed, a chord plays.

Then you decide: **carry it forward**, or **leave it here**.

---

## Features

**Strata View** — your years as geological layers  
Each year is a stratum, each month a block. Completed months glow. Width is proportional to photo count.

**Site View** — events grouped automatically  
Photos are clustered into shooting events (< 30min gap = same event). Enter any event to start deciding.

**Decision View** — the excavation cave  
Full-screen photo display with ambient blur background, queued Polaroids waiting on the side, keyboard shortcuts for flow, undo stack.

**Today's Excavation** — cross-year same-day discovery  
The most surprising feature: seeing the same date across years side by side reveals patterns in how you move through the world.

**Memory Gallery** — what you've chosen to carry  
Browse all kept photos, filtered by year. The collection that's building.

**Soft delete safety**  
Nothing is permanently deleted without your explicit confirmation. All "leave" decisions go to a 30-day buffer first.

**Keyboard-first**

| Key | Action |
|---|---|
| `K` or `→` | Carry forward (keep) |
| `D` or `←` | Leave here (soft delete) |
| `S` or `↑` | Decide later (skip) |
| `Z` | Undo |
| `F` | Mark as book candidate |
| `Space` | Full-screen lightbox |

---

## Tech stack

| | |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Framer Motion + Zustand |
| Backend | Python 3.11 + FastAPI + SQLite |
| RAW decoding | rawpy (libraw bindings) — Sony ARW, Fuji RAF |
| Audio | Web Audio API — procedurally generated, zero external files |
| Canvas | HTML Canvas `destination-out` compositing for soil reveal |
| Fonts | Cormorant Garamond (headings) + DM Sans (body) |
| Storage | Local SQLite — intentional: local-first, zero-dependency, single-user |
| Backend complexity | RAW decoding, EXIF parsing, event clustering algorithm, file-system safety guarantees (soft delete + XMP sidecar tracking + append-only audit log), async preview pipeline, GPS clustering for story mode |

---

## Quick Start

**Prerequisites:** Node 18+, Python 3.11+, a folder of photos

```bash
# Clone
git clone https://github.com/rickyke2023-ctrl/unearth.git
cd unearth

# Backend
cd backend
pip install -r requirements.txt
# Edit config.py — set PHOTO_ROOT to your photo folder path
python main.py
# Backend runs on localhost:8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
# Open localhost:5173
```

Then open the app, click "Start Scan", and let it index your photos. Scanning 8,000 photos takes about 15 seconds.

> **Note:** Currently designed for a single-user Mac setup with photos organized by `year/month/` folders (Lightroom export structure). RAW files (ARW, RAF), JPEG, HEIF, PNG all supported.

---

## Roadmap

**v0.2 — current**
- [x] Full decision loop (keep / leave / skip / undo / star)
- [x] Strata, Site, Decision, Excavation, Memory Gallery views
- [x] Soft delete with 30-day buffer
- [x] Today's Excavation — cross-year same-day surfacing
- [x] Procedural audio + 8-layer geological canvas texture
- [x] Story mode backend (cross-year same-location, full-day narratives)

**v0.3 — next**
- [ ] Camera gesture: scrub with your hand in front of the webcam (MediaPipe Hands — interface already in place via `scrubAt(nx, ny)`)
- [ ] GPS geocoding for richer location data
- [ ] Full 40K photo scan (pending camera gesture UX validation)

**v1.0 — discovery layer**

*The shift from "you judge photos" to "the system helps you understand yourself."*

- [ ] **Theme Mode — your obsessions**: the system finds what you've been photographing all along — windows, rain, cats, empty streets — and presents them as a thematic reel across years. "It turns out you've taken 847 photos of windows." That discovery is the gift.
- [ ] **Story Mode — cross-year narratives**: the same GPS location in 2020 and 2023. Every first day of each month across a year. Three cities, the same kind of light. The system composes the story; you experience it.
- [ ] **Daily quota**: 30 photos/day, like a daily poem. Not a backlog to clear — a ritual to return to.

**v2.0 — open tool**
- [ ] Extract configurable defaults (photo root, language, preferences)
- [ ] Package as standalone Mac app (Tauri or Electron)
- [ ] Open source release (MIT)

---

## Design philosophy

> 显影不是照片管理工具。  
> 它是一面镜子——你以为你在整理照片，  
> 它在帮你读懂，这些年你一直在看什么。

*Unearth is not a photo management tool.  
It's a mirror — you think you're organizing photos,  
it's helping you understand what you've been looking at all these years.*

---

## Status

Personal project, active development. Built by one person + AI in about 2 days of actual working time.

Built with **Claude** (architecture + frontend) + **Codex** (backend execution). The multi-agent development workflow is part of the experiment — [see dev logs](DEVLOG_20260521.md).

---

*显影 · Unearth — v0.2.0 · 2026*
