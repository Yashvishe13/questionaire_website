#!/usr/bin/env python3
"""Randomly copy 100 MIDI files from the full Lakh MIDI dataset into a flat folder."""

import random
import shutil
from pathlib import Path

# Paths relative to repo root (same layout as scripts/full_dataset_download.sh)
_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent
_LAKH_DIR = _REPO_ROOT / "lakh_midi_full"

dataset_path = _LAKH_DIR / "lmd_full"
output_path = _LAKH_DIR / "lmd_100_samples"

# Create output folder
output_path.mkdir(parents=True, exist_ok=True)

# Collect all MIDI file paths
midi_files = [p for p in dataset_path.rglob("*.mid") if p.is_file()]

print(f"Dataset root: {dataset_path}")
print(f"Total MIDI files found: {len(midi_files)}")

# Randomly sample 100 files
sample_size = 100
if len(midi_files) < sample_size:
    raise SystemExit(
        f"Need at least {sample_size} MIDI files under {dataset_path}, found {len(midi_files)}. "
        "Run scripts/full_dataset_download.sh first."
    )
random_samples = random.sample(midi_files, sample_size)

# Copy sampled files
for i, file_path in enumerate(random_samples):
    dest_path = output_path / f"sample_{i}.mid"
    shutil.copy2(file_path, dest_path)

print(f"Copied {sample_size} random MIDI files to {output_path}")
