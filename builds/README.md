# Parallel builds — compare & merge protocol (agreed ~1:45pm)

Two implementations of `docs/PLAN-FINAL.md` are being built in parallel, then
compared and merged.

- `builds/vj/` — Vijay's lane (Claude). Do not edit from other lanes.
- `builds/<felix>/` — Felix's lane; pick any dir name here, it's yours alone.
- **Shared, single-owner, at repo root** (use, don't duplicate): `scripts/`
  (seed-jane-doe.mjs, index-moss.mjs, feed-audio.mjs), `assets/audio/`, and the ONE
  hosted Medplum Jane Doe record + Moss index they maintain. Coordinate before
  reseeding — reseeding + reindexing mid-take breaks the other lane too.
- Merge target after compare: `app/` (currently unclaimed on purpose).
- Both lanes commit small + push main often; disjoint dirs = no conflicts.
