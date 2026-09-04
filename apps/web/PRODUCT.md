# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo user: the developer/owner themselves, no one else. Uses Edito during game development to prepare sound — importing, cutting, arranging, and mixing SFX/voice/ambience assets that go into a game project.

## Product Purpose

Edito is a personal multi-track audio editor for cutting, arranging, and mixing sound assets for game development. Success means a fast, frictionless import → edit → mixdown loop that fits into a solo gamedev sound-design workflow, and an interface pleasant enough to want to keep using daily.

## Positioning

No competitive differentiation vs. Audacity/Descript/GarageBand is intended. Edito exists to be a practical, always-available, easy-to-use personal tool that the owner refines over time based on their own usage and preferences — not a product aimed at other users.

## Operating Context

Used during game dev sound-design sessions: import raw SFX/audio assets, trim and arrange them across multiple tracks, record mic takes when needed, then export a mixdown for use in the game. Single active project at a time (import → arrange → export cycle), run locally/self-hosted.

## Capabilities and Constraints

- Multi-track timeline: import audio, drag/cut/arrange clips, per-track mute/solo/volume/pan
- Microphone recording into a track
- Mixdown export (WAV, 44100 Hz)
- Single-user only — no accounts, sharing, or collaboration needed
- Existing stack (not being replaced by this redesign): React 19 + TypeScript + Vite, Tailwind CSS, Radix UI primitives, Zustand, WaveSurfer.js + Web Audio API

## Brand Commitments

- Name: "Edito"
- UI language: French only, no i18n planned
- Dark mode only — no light theme required

## Product Principles

- Solo-first: every decision optimizes for one user's daily workflow, not onboarding or discoverability for others.
- Practical over branded: no invented positioning or marketing tone — the tool should feel good to open and use often.
- Built for the gamedev sound loop: fast import → edit → export, clear track/clip manipulation, obvious at-a-glance state (playing, recording, saved, selected).
- Free to evolve: the owner will keep refining the UI from real usage, so the system should be coherent and durable rather than a one-shot rigid brief.
- Clarity over cleverness: today's UI has real usability failures (invisible white-on-white buttons, no explanation of what controls do, no visible affordances) — legibility, contrast, and obvious interactive states are the non-negotiable floor.

## Accessibility & Inclusion

No external accessibility requirement (single known user), but current contrast failures (white text on white buttons, unclear icon-only controls) must be fixed as baseline usability, not treated as optional polish.
