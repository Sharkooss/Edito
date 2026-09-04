---
name: Edito
description: A hardware mixing console you already know how to touch, not a website pretending to be a DAW.
colors:
  studio-bg: "#111215"
  studio-panel: "#1c1d21"
  studio-border: "#34363c"
  console-inset: "#0b0c0e"
  console-meter: "#4dd0e1"
  console-meter-dim: "#2a5a61"
  console-mute: "#f5b544"
  console-mute-foreground: "#241704"
  primary: "#f97316"
  primary-foreground: "#1a0f04"
  secondary: "#2a2c31"
  secondary-foreground: "#f0efec"
  muted: "#24262b"
  muted-foreground: "#9a9ca3"
  accent: "#34363c"
  accent-foreground: "#f0efec"
  destructive: "#ef4444"
  destructive-foreground: "#200404"
  border: "#34363c"
  ring: "#f97316"
  foreground: "#f0efec"
  track-1: "#f97316"
  track-2: "#22d3ee"
  track-3: "#a78bfa"
  track-4: "#4ade80"
  track-5: "#f472b6"
  track-6: "#facc15"
typography:
  label:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.3
  readout:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0.05em"
    fontFeature: "tabular-nums"
  readout-small:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.2
    fontFeature: "tabular-nums"
rounded:
  sm: "calc(0.5rem - 4px)"
  md: "calc(0.5rem - 2px)"
  lg: "0.5rem"
  full: "9999px"
spacing:
  xs: "0.375rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
  readout-panel:
    backgroundColor: "{colors.console-inset}"
    textColor: "{colors.console-meter}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  channel-strip:
    backgroundColor: "{colors.studio-panel}"
    height: "10rem"
    width: "15rem"
---

# Design System: Edito

## Overview

**Creative North Star: "The Channel Rack"**

Edito is built as a hardware mixing console: a charcoal chassis with brushed-panel surfaces, printed hairline seams between sections, and physical-feeling controls (faders, toggle switches, an LCD-style time readout) rather than webpage widgets pretending to be studio gear. The interface is dense, always-dark, and legible at a glance — every state (playing, recording, muted, soloed, saved) reads instantly from color and position alone, because the sole user reads it hundreds of times a session with no time to interpret ambiguity.

The palette is disciplined to a single accent for action and brand: console-orange for action and record states, teal reserved exclusively for meters and time readouts. Track-state toggles are the one deliberate exception — Mute's active state carries its own amber (`console-mute`) precisely so it never reads as "the same button" as Solo's orange active state from across a room. Everything else is charcoal neutrals and hairline borders. Two type families do all the work — IBM Plex Mono for every numeric readout (time, percentages, pan values), IBM Plex Sans for every label — so a glance at a glyph's shape tells the owner whether they're looking at a value or a name before they've even read it.

**Key Characteristics:**
- Charcoal chassis with brushed-panel surfaces and hairline seams (`border-studio-border`), never open whitespace
- One accent color (console-orange) for action/record/selection state; teal is a reserved meter-and-readout color, never a general accent; Mute's toggle-active state is the one named exception, using its own `console-mute` amber so it never gets confused with Solo's orange active state
- Mono for numbers, Sans for words — no exceptions
- Toolbar sections separated by physical 1px dividers (`h-6 w-px bg-studio-border`), not spacing alone
- Flat, inset, and bordered surfaces stand in for shadows — this is a panel-and-seam world, not a lifted-card world

## Colors

The palette is a charcoal instrument panel with exactly one warm accent and one cool "meter" color; there is no secondary or tertiary hue family.

### Primary
- **Console Orange** (`#f97316`): the single accent. Used for the record toggle's active/pulsing state, the Solo switch's active state, the playhead line, the focus ring, and the play button's active glow (`shadow-[0_0_10px_rgba(249,115,22,0.55)]`). Also doubles as `--ring` (focus outline) and the waveform's progress color.

### Track-State
- **Console Mute** (`#f5b544`, `console-mute` / foreground `#241704`, `console-mute-foreground`): the Mute toggle's active-state color. This is a deliberate second semantic state color, not a general accent — it exists solely so Mute-active and Solo-active read as two distinct states at a glance, not two instances of the same button. See "The Mute-Is-Amber Rule" below.

### Neutral
- **Chassis Black** (`#111215`, `studio-bg`): the app's outermost background, applied to `body`.
- **Brushed Panel** (`#1c1d21`, `studio-panel`): toolbar, transport bar, and channel-strip surfaces — one level up from the chassis.
- **Hairline Seam** (`#34363c`, `studio-border` / `--border`): every panel divider, card border, and section rule. This is the "printed seam" the world is named for.
- **Console Inset** (`#0b0c0e`, `console-inset`): recessed surfaces — the LCD time readout, the save-status pill, the zoom-control well, clip bodies. Reads as "cut into" the panel rather than sitting on it.
- **Panel Text** (`#f0efec`, `--foreground`): primary text on all dark surfaces.
- **Muted Label** (`#9a9ca3`, `--muted-foreground`): secondary labels, helper text, inactive icon tint.

### Named Rules
**The One Accent Rule.** Console-orange is the only color that means "action, recording, or active selection" for brand/action controls (buttons, the record toggle, focus rings, the playhead). If a new *action* control needs an active state, it reaches for orange or it isn't done — a second warm accent there is a system violation, not a variant. This rule governs action/brand color; it does not govern the Mute/Solo track-state toggle pair, which is deliberately exempted by the Mute-Is-Amber Rule below.

**The Meter-Only Teal Rule.** Teal (`#4dd0e1` console-meter / `#2a5a61` console-meter-dim) is reserved for the LCD time readout and waveform rendering. It never appears on an interactive control (buttons, toggles, links); if teal shows up on something clickable, that's a build defect, not a new use case.

**The Mute-Is-Amber Rule.** Mute's active state uses `console-mute` (amber, `#f5b544` / foreground `#241704`); Solo's active state reuses the primary `console-orange` accent. The two toggles must never share a color — they sit side by side in the same row, and the only way to tell them apart from across a room is color, since the icon and label are small. This is the one place in the system where a second warm hue is intentional rather than a violation of the One Accent Rule.

## Typography

**Display Font:** none — this system has no display/hero role; the largest text on screen is a track name at label size.
**Body Font:** IBM Plex Sans (with `ui-sans-serif, system-ui, sans-serif`)
**Label/Mono Font:** IBM Plex Mono (with `ui-monospace, SFMono-Regular, monospace`)

**Character:** A no-nonsense instrument-panel pairing. Plex Sans carries every word (labels, buttons, track names); Plex Mono is reserved strictly for numbers and codes, always with `tabular-nums` so digits don't jitter as values change live during playback.

### Hierarchy
- **Body** (400, 14px/`text-sm`, 1.4): default UI text, toolbar drag-and-drop hint, dialog copy.
- **Label** (500, 14px/`text-sm`): track names, button labels, section headers — medium weight, never uppercase, never letter-spaced (no kicker/eyebrow treatment anywhere in the build).
- **Caption** (400, 12px/`text-xs`): helper text under controls (save status, hint text).
- **Readout** (400, 14px/`text-sm`, mono, `tracking-wider`, `tabular-nums`, teal): the LCD transport time — the single largest, most prominent numeric display.
- **Readout-small** (400, 11px/`text-[11px]`, mono, `tabular-nums`, muted): fader percentage, pan value, clip name overlay — small inline numeric/code labels riding beside sliders and on clip bodies.

### Named Rules
**The Digits-Are-Mono Rule.** Any value that changes at runtime or represents a measurement — time, volume percent, pan position, clip labels — renders in IBM Plex Mono with `tabular-nums`. Any value that names something — a track, a button, a menu item — renders in IBM Plex Sans. This is how the owner distinguishes "a number I can act on" from "a word" without reading it.

## Layout

The frame is a fixed vertical stack of horizontal bands: a toolbar rack, a transport bar, then a two-column body (a fixed-width `w-60` column of channel strips on the left, a flex-1 scrollable timeline on the right). Each band is separated by a `border-b border-studio-border` hairline, never by open margin — the "printed seam" reads as a physical panel joint.

Within the toolbar and transport bar, related controls are grouped and separated from the next group by a literal `h-6 w-px bg-studio-border` vertical divider, not by extra gutter spacing. This is a rack-of-modules layout: each group is its own module, seamed to its neighbors.

Channel strips are fixed at `h-40 w-60` (160px × 240px) regardless of content, stacked vertically with no gap and a shared left border — this is the console's fixed hardware unit, one strip per track, never variable height. The timeline mirrors that fixed `h-40` row height per track lane so a strip and its lane always line up.

Density is high and controls are compact (`h-8`/`h-9` control heights, `gap-1`–`gap-2` internal spacing, `p-2`–`p-3` panel padding) — consistent with a solo power-user tool inspecting many tracks at once rather than a marketing surface with breathing room.

## Elevation & Depth

Edito is flat with two structural depth cues instead of shadows: hairline borders that mark panel joints, and an "inset" background color (`console-inset`, `#0b0c0e`) that reads as recessed relative to the panel color (`studio-panel`, `#1c1d21`) it sits inside. There is no ambient drop-shadow vocabulary; the two shadow uses that do exist are structural glows tied to an active/focused state, not resting elevation.

### Shadow Vocabulary
- **Active-glow** (`box-shadow: 0 0 10px rgba(249,115,22,0.55)` / `0 0 8px rgba(249,115,22,0.55)`): applied only while a control is actively engaged — the play button while playing, the Solo switch while soloed. Signals "this is live," not resting depth.
- **Selection ring** (`box-shadow: 0 0 0 1px rgba(249,115,22,0.4)` plus `border-primary`): marks the currently selected clip on the timeline.

### Named Rules
**The Inset-Not-Lifted Rule.** Depth is conveyed by recession (console-inset wells for readouts, clip bodies, status pills), never by elevation. Nothing in this system casts a resting drop shadow to look "raised"; a shadow only ever appears as a live-state glow.

## Shapes

Corners are gently rounded throughout at a single consistent radius (`--radius: 0.5rem`, exposed as `rounded-md` ≈6px for controls and readout panels, `rounded-full` for slider thumbs and track pills) — enough to soften hardware-panel edges without softening into a rounded, toy-like world. Borders are 1px hairlines (`border-studio-border`) used constantly as the seam device described in Layout; there is no double-border or heavy-stroke treatment anywhere. The one recurring silhouette beyond the rounded-rect control is the colored edge strip: a `w-1.5` full-height tint bar on the left of each channel strip, identifying its track color at a glance without needing a swatch or icon.

## Components

### Buttons
- **Shape:** `rounded-md` (6px), consistent across all variants and sizes.
- **Primary (default):** console-orange background, dark orange-tinted foreground (`#1a0f04`) for contrast, `shadow` at rest, `hover:bg-primary/90`. Used for the primary play/pause transport control.
- **Secondary:** panel-toned background (`#2a2c31`) with light foreground; used for Enregistrer/Exporter/Ajouter une piste and other non-primary actions — the default "regular action" button in this system.
- **Destructive:** red (`#ef4444`) background with dark red foreground; used only when recording is active (Arrêter l'enregistrement) — recording-in-progress is the one state allowed to override the one-accent rule with red, since it is a genuine hazard/stop state, not a second accent.
- **Ghost:** transparent, `hover:bg-accent`; used for icon-only controls (zoom in/out, track reorder/delete) that shouldn't compete visually with primary actions.
- **Icon size:** `size` variant is a fixed `h-9 w-9` square (transport controls); a smaller ad hoc `size-6` ghost button appears in the channel-strip header for reorder/delete.
- **Hover / Focus:** background darkens or shifts one step (`/90`, `/80`); focus uses a 1px `ring-ring` (console-orange) outline, never an outline-color mismatch.

### Channel Strip (signature component)
The channel strip is the system's signature: a fixed `h-40 w-60` hardware unit per track, not a generic list row. It carries, top to bottom: a track-colored left edge strip (`w-1.5`), a name row with compact reorder/delete ghost buttons, a volume row (icon + slider + mono percentage readout), a pan row (a "P" glyph + slider + mono G/C/D label), and a two-button Mute/Solo row.

Mute and Solo are **not** built from the generic `Button` component — they're bespoke two-state toggles (`aria-pressed`, explicit active/inactive class pairs) because their active states carry system meaning the generic button variants don't express: Solo active is console-orange with the active-glow (correctly reusing the primary accent for an active/armed state); Mute active renders in `console-mute` (`border-console-mute bg-console-mute text-console-mute-foreground`), the dedicated amber token reserved for this one state (see the Mute-Is-Amber Rule). Inactive state for both is identical: `border-studio-border bg-console-inset text-muted-foreground`.

### Transport / Readout Panel
A recessed (`bg-console-inset`) rounded panel showing the current playback time in mono, teal, tabular-nums text (`text-console-meter`) — the system's one true "LCD screen." The same inset-panel pattern is reused for the save-status pill and the zoom in/out control cluster, establishing "recessed rounded well" as the container language for any small instrument readout or control cluster, not just the transport clock.

### Timeline / Clip
The timeline lane background is a repeating 1px vertical line grid (`linear-gradient` at `${pxPerSecond}px` intervals) — a literal per-second graticule synced to zoom level, evoking a patch-bay/oscilloscope grid rather than a generic ruler. Clips render as rounded, inset-toned (`bg-console-inset`) rectangles with a hairline border that shifts to `border-primary` plus a 1px orange selection ring when selected; a mono clip-name label sits top-left over a translucent chassis-black backing (`bg-studio-bg/70`) for legibility over any waveform content. Left/right edges expose thin (`w-1.5`) translucent-white drag handles for trimming, visible only as a subtle hover brightening.

### Inputs / Sliders
- **Style:** Radix Slider with a thin (`h-1.5`) rounded track in dimmed primary (`bg-primary/20`) and a filled orange range; a small circular thumb (`h-4 w-4`) with a primary-tinted border on a background fill.
- **Focus:** 1px `ring-ring` (orange) outline on the thumb, matching the button focus treatment — one focus language across all interactive controls.

## Do's and Don'ts

### Do:
- **Do** put every runtime number and code value in IBM Plex Mono with `tabular-nums`; every label and name in IBM Plex Sans.
- **Do** separate control groups within a toolbar or transport bar with a literal `h-6 w-px bg-studio-border` divider, not extra gutter.
- **Do** use `bg-console-inset` for any recessed/LCD-like readout surface (clock, status pill, control well, clip body).
- **Do** reserve the active-glow box-shadow (`shadow-[0_0_Npx_rgba(249,115,22,0.55)]`) for genuinely live/armed states (playing, soloed), not resting emphasis.
- **Do** keep the channel strip at a fixed `h-40 w-60` footprint; it is a hardware unit, not a flexible card.
- **Do** use `console-mute`/`console-mute-foreground` for Mute's active state and `primary`/`primary-foreground` for Solo's active state — never swap them or let either toggle borrow the other's color.

### Don't:
- **Don't** introduce a second general-purpose *action/brand* accent color. Console orange is the only "this is active/actionable" color for buttons and brand controls; red is reserved solely for the recording-hazard state. (This does not apply to the Mute/Solo track-toggle pair — see the Mute-Is-Amber Rule.)
- **Don't** use teal (`console-meter`/`console-meter-dim`) on anything clickable — it is a meter/readout color only.
- **Don't** add a resting drop-shadow to imply elevation; depth in this system comes from recession (inset backgrounds) and hairline borders, never a lifted-card shadow.
- **Don't** add uppercase, letter-spaced "kicker" or "eyebrow" labels anywhere — no label in the shipped build uses that treatment, and it doesn't belong to this instrument-panel voice.
- **Don't** reach for a raw Tailwind color utility (e.g. `amber-400`, `amber-500`) for any new UI state. Every color used in a component must resolve to a declared token (`console-mute`, `primary`, `destructive`, etc.); an un-tokenized literal is a build defect regardless of which hue it is.
