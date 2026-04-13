export const SECTIONS = [
  {
    id: "harmony",
    label: "Harmony",
    definition:
      "Harmony refers to chord progression, tonal consistency, and harmonic color.",
    focus: ["chord progression", "tonal center", "harmonic continuity"],
    ignore: ["rhythm or tempo", "instrumentation", "minor audio differences"],
    prompt:
      "Which version better preserves the harmony of the original music, aside from the intended edit?",
  },
  {
    id: "rhythm_meter",
    label: "Rhythm & Meter",
    definition:
      "Rhythm and meter refer to beat alignment, tempo, and rhythmic patterns.",
    focus: ["beat timing", "tempo consistency", "rhythmic structure"],
    ignore: ["pitch or harmony", "timbre", "instrumentation"],
    prompt:
      "Which version better preserves the rhythm and meter of the original music, aside from the intended edit?",
  },
  {
    id: "structural_form",
    label: "Structural Form",
    definition:
      "Structural form refers to the large-scale organization of music, including sections and repetition patterns.",
    focus: [
      "section boundaries, such as intro, verse, chorus",
      "repetition structure",
      "overall organization",
    ],
    ignore: ["small note-level changes", "local timing variations", "timbre"],
    prompt:
      "Which version better preserves the structural form of the original music, aside from the intended edit?",
  },
  {
    id: "melodic_content_motifs",
    label: "Melodic Content & Motifs",
    definition:
      "Melodic content refers to pitch sequences and contour, while motifs are recurring melodic patterns.",
    focus: [
      "melodic contour, up and down movement",
      "recognizable phrases",
      "recurring motifs",
    ],
    ignore: ["pitch shift or transposition", "tempo changes", "instrumentation"],
    prompt:
      "Which version better preserves the melodic content and motifs of the original music, aside from the intended edit?",
  },
];

export const EDITING_INSTRUCTIONS = [
  {
    id: "global_pitch_shift",
    text: "Shift the pitch of the music up by 6 semitones.",
  },
  {
    id: "global_time_stretch",
    text: "Stretch the timing of the music by 1.5x.",
  },
  {
    id: "segment_shuffle",
    text: "Cyclically rotate 4 equal music segments.",
  },
  {
    id: "vocal_only_pitch_shift",
    text: "Shift only the vocal pitch up by 5 semitones.",
  },
];

export const INSTRUCTION_AUDIO_MAP = {
  global_pitch_shift: {
    librosaDir: "librosa_pitch_shift",
    midiDir: "midi_pitch_shift",
  },
  global_time_stretch: {
    librosaDir: "librosa_time_stretch",
    midiDir: "midi_time_stretch",
  },
  segment_shuffle: {
    librosaDir: "librosa_segment_shuffle",
    midiDir: "midi_segment_shuffle",
  },
  vocal_only_pitch_shift: {
    librosaDir: "librosa_vocal_pitch_shift",
    midiDir: "midi_vocal_shift",
  },
};

export const SPLITS = [
  { start: 0, count: 20, questionsPerSection: [5, 5, 5, 5] },
  { start: 20, count: 20, questionsPerSection: [5, 5, 5, 5] },
  { start: 40, count: 20, questionsPerSection: [5, 5, 5, 5] },
  { start: 60, count: 20, questionsPerSection: [5, 5, 5, 5] },
  { start: 80, count: 18, questionsPerSection: [5, 5, 5, 3] },
];

export const STORAGE_KEY = "musicQuestionnaireSession.v10";
export const COMPLETED_KEY = "musicQuestionnaireCompleted.v10";
export const PENDING_PARTICIPANT_KEY =
  "musicQuestionnairePendingParticipantId.v1";
export const START_DRAFT_KEY = "musicQuestionnaireStartDraft.v1";
