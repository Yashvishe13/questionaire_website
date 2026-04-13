#!/usr/bin/env bash
# Render all four MIDI edit folders to WAV (same paths the questionnaire expects).
# Uses ``python`` (override with ``PYTHON=/path/to/python`` if needed).
#
# Optional env:
#   EXTRA_ARGS — e.g. EXTRA_ARGS="--overwrite" or EXTRA_ARGS="--overwrite --no-progress"

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY="${PYTHON:-python}"
SCRIPT="$ROOT/scripts/midi_samples_to_wav.py"
if [[ -z "${EXTRA_ARGS:-}" ]]; then
  EXTRA_ARR=()
else
  # shellcheck disable=SC2206
  EXTRA_ARR=($EXTRA_ARGS)
fi

failed=0

for rel in music/midi_pitch_shift music/midi_time_stretch music/midi_segment_shuffle music/midi_vocal_shift; do
  dir="$ROOT/$rel"
  echo "========== MIDI → WAV: $rel =========="
  if ! "$PY" "$SCRIPT" --input-dir "$dir" --output-dir "$dir" "${EXTRA_ARR[@]}"; then
    echo "FAILED: $rel" >&2
    failed=1
  fi
done

if [[ "$failed" -ne 0 ]]; then
  echo "One or more folders failed." >&2
  exit 1
fi
echo "All four MIDI → WAV runs finished OK."
