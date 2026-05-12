# Sprite Production Progress

## Objective

Use `.codex/skills/game-character-sprites` to produce the sprite assets required by `PLAN.md` for the Mini LoL 2.5D MOBA prototype, matching `assets/images/moba-interface-concept.png` for 2.5D top-down readability while keeping all art original.

## Completed

- `PLAN.md`
- `assets/sprites/characters/astra_vanguard/run/source/64-base-astra-vanguard.png`
- `assets/sprites/characters/crimson_duelist/run/source/64-base-crimson-duelist.png`
- `assets/sprites/characters/astra_vanguard/run/64/final/move-sheet-clean.png`
- `assets/sprites/characters/astra_vanguard/run/64/final/idle-sheet-clean.png`
- `assets/sprites/characters/astra_vanguard/run/64/final/basic_attack-sheet-clean.png`
- `assets/sprites/characters/astra_vanguard/run/64/final/cast-sheet-clean.png`
- `assets/sprites/characters/astra_vanguard/run/64/final/hit-sheet-clean.png`
- `assets/sprites/characters/astra_vanguard/run/64/final/death-sheet-clean.png`
- `assets/sprites/characters/crimson_duelist/run/64/final/idle-sheet-clean.png`
- `assets/sprites/characters/crimson_duelist/run/64/final/move-sheet-clean.png`
- `assets/sprites/characters/crimson_duelist/run/64/final/basic_attack-sheet-clean.png`
- `assets/sprites/characters/crimson_duelist/run/64/final/cast-sheet-clean.png`
- `assets/sprites/characters/crimson_duelist/run/64/final/hit-sheet-clean.png`
- `assets/sprites/characters/astra_vanguard/run/64/qa/move-contact-sheet.png`
- `assets/sprites/characters/astra_vanguard/run/64/qa/move-validation.json`
- `assets/sprites/characters/astra_vanguard/run/64/qa/move-motion-audit.json`
- `assets/sprites/characters/astra_vanguard/run/64/qa/move-manifest-validation.json`
- `assets/sprites/characters/astra_vanguard/run/64/qa/move-visual-review.json`
- `assets/sprites/characters/astra_vanguard/run/64/qa/previews/move-*-transparent-x4.webp`
- `assets/sprites/characters/astra_vanguard/run/64/qa/previews/move-*-transparent-x4.gif`
- `assets/sprites/characters/astra_vanguard/run/64/qa/previews/move-*-checker-x4.gif`

## Current Focus

Generate and validate `crimson_duelist` 64x64 `death` 8-direction sheet.

## Remaining Character Sprite Sheets

### Astra Vanguard

- `idle`: complete
- `move`: complete
- `basic_attack`: complete
- `cast`: complete
- `hit`: complete
- `death`: complete

### Crimson Duelist

- `idle`: complete
- `move`: complete
- `basic_attack`: complete
- `cast`: complete
- `hit`: complete
- `death`: pending

### Azure Melee Minion

- `idle`: pending
- `move`: pending
- `basic_attack`: pending
- `hit`: pending
- `death`: pending

### Crimson Melee Minion

- `idle`: pending
- `move`: pending
- `basic_attack`: pending
- `hit`: pending
- `death`: pending

### Azure Caster Minion

- `idle`: pending
- `move`: pending
- `basic_attack`: pending
- `hit`: pending
- `death`: pending

### Crimson Caster Minion

- `idle`: pending
- `move`: pending
- `basic_attack`: pending
- `hit`: pending
- `death`: pending

## Remaining Secondary Assets

- `azure_outer_tower`: pending
- `crimson_outer_tower`: pending
- `azure_core`: pending
- `crimson_core`: pending
- `astra_skill_vfx`: pending
- `crimson_skill_vfx`: pending
- `moba_ui_icons`: pending

## Recovery Notes

- Do not regenerate completed `move` rows unless visual review later rejects them.
- Prefer single or low-concurrency image generation requests; a previous high-concurrency `idle` batch returned empty image results for several rows.
- Every accepted action sheet must have source strips, generated strips, frames, clean sheet, metadata, validation JSON, motion audit where applicable, contact sheet, previews, manifest provenance, and visual review.
