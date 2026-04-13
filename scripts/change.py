import os
import pretty_midi
from tqdm import tqdm

input_dir = "lmd_100_samples"
output_dir = "midi_pitch_shift"
os.makedirs(output_dir, exist_ok=True)

def pitch_shift(midi, semitones=6):
    for inst in midi.instruments:
        for note in inst.notes:
            note.pitch = max(0, min(127, note.pitch + semitones))
    return midi

for file in tqdm(os.listdir(input_dir)):
    if not file.endswith(".mid"):
        continue
    
    try:
        midi = pretty_midi.PrettyMIDI(os.path.join(input_dir, file))
        midi = pitch_shift(midi, 6)
        midi.write(os.path.join(output_dir, file))
    except:
        continue

import os
import pretty_midi
from tqdm import tqdm

input_dir = "lmd_100_samples"
output_dir = "midi_time_stretch"
os.makedirs(output_dir, exist_ok=True)

def time_stretch(midi, factor=1.5):
    for inst in midi.instruments:
        for note in inst.notes:
            note.start *= factor
            note.end *= factor
    return midi

for file in tqdm(os.listdir(input_dir)):
    if not file.endswith(".mid"):
        continue
    
    try:
        midi = pretty_midi.PrettyMIDI(os.path.join(input_dir, file))
        midi = time_stretch(midi, 1.5)
        midi.write(os.path.join(output_dir, file))
    except:
        continue

import os
import pretty_midi
from tqdm import tqdm

input_dir = "lmd_100_samples"
output_dir = "midi_segment_shuffle"
os.makedirs(output_dir, exist_ok=True)

def segment_shuffle(midi, segments=4):
    end_time = midi.get_end_time()
    seg_len = end_time / segments
    
    new_midi = pretty_midi.PrettyMIDI()
    
    for inst in midi.instruments:
        new_inst = pretty_midi.Instrument(program=inst.program)
        
        for note in inst.notes:
            seg_idx = int(note.start // seg_len)
            new_seg_idx = (seg_idx + 1) % segments
            
            shift = (new_seg_idx - seg_idx) * seg_len
            
            new_note = pretty_midi.Note(
                velocity=note.velocity,
                pitch=note.pitch,
                start=note.start + shift,
                end=note.end + shift
            )
            new_inst.notes.append(new_note)
        
        new_midi.instruments.append(new_inst)
    
    return new_midi

for file in tqdm(os.listdir(input_dir)):
    if not file.endswith(".mid"):
        continue
    
    try:
        midi = pretty_midi.PrettyMIDI(os.path.join(input_dir, file))
        new_midi = segment_shuffle(midi, 4)
        new_midi.write(os.path.join(output_dir, file))
    except:
        continue

import os
import pretty_midi
from tqdm import tqdm

input_dir = "lmd_100_samples"
output_dir = "midi_vocal_shift"
os.makedirs(output_dir, exist_ok=True)

def get_melody_inst(midi):
    best_inst = None
    best_pitch = -1
    
    for inst in midi.instruments:
        if len(inst.notes) == 0:
            continue
        avg_pitch = sum(n.pitch for n in inst.notes) / len(inst.notes)
        if avg_pitch > best_pitch:
            best_pitch = avg_pitch
            best_inst = inst
    return best_inst

def vocal_shift(midi, semitones=5):
    inst = get_melody_inst(midi)
    if inst:
        for note in inst.notes:
            note.pitch = max(0, min(127, note.pitch + semitones))
    return midi

for file in tqdm(os.listdir(input_dir)):
    if not file.endswith(".mid"):
        continue
    
    try:
        midi = pretty_midi.PrettyMIDI(os.path.join(input_dir, file))
        midi = vocal_shift(midi, 5)
        midi.write(os.path.join(output_dir, file))
    except:
        continue