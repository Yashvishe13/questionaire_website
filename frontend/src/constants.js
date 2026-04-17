const MUSIC_BASE = "https://questionaire.viewdns.net/music";

export const SECTIONS = [
  {
    id: "harmony",
    label: "Harmony",
    definition:
      "Harmony refers to the overall tonal character of a piece — the sense of which musical key it is in, how the pitch classes (notes) are distributed over time, and how consistently the music stays within a tonal center.",
    focus: [
      "The overall key or tonal center of the music (does the edited clip feel like it is in the same key as the original?)",
      "The distribution and balance of pitches across the piece (do the same notes dominate in both clips?)",
      "The moment-to-moment consistency of tonal color (does the harmonic atmosphere evolve in the same way?)",
    ],
    ignore: ["rhythm or tempo", "instrumentation", "minor audio differences"],
    prompt:
      "Which edited clip is farther from the original in terms of harmony?",
    example: {
      clips: [
        { clip: "Original", edit: "no edit" },
        { clip: "A", edit: "no edit (identical to original)" },
        { clip: "B", edit: "+6 semitones (tritone)" },
      ],
      audio: {
        original: `${MUSIC_BASE}/original_audio/001.wav`,
        clipA: `${MUSIC_BASE}/example/edit_1_audio/harmony/example_harmony_identical_001_edit_1.wav`,
        clipB: `${MUSIC_BASE}/example/edit_2_audio/harmony/example_harmony_+6semitone_001_edit_2.wav`,
      },
      correctAnswer: "B is farther from the original.",
      explanation:
        'Clip A is identical to the original, while Clip B has been shifted up by 6 semitones (a tritone), changing both the key and the pitch-class distribution. Therefore B is farther from the original in terms of harmony.',
    },
    questions: [
      {
        id: "q1",
        sourceId: "002",
        audio: {
          original: `${MUSIC_BASE}/original_audio/002.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/harmony/q1_harmony_+7semitone_002_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/harmony/q1_harmony_+6semitone_002_edit_2.wav`,
        },
      },
      {
        id: "q2",
        sourceId: "003",
        audio: {
          original: `${MUSIC_BASE}/original_audio/003.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/harmony/q2_harmony_+4semitone_003_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/harmony/q2_harmony_+6semitone_003_edit_2.wav`,
        },
      },
      {
        id: "q3",
        sourceId: "004",
        audio: {
          original: `${MUSIC_BASE}/original_audio/004.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/harmony/q3_harmony_+5semitone_004_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/harmony/q3_harmony_+2semitone_004_edit_2.wav`,
        },
      },
      {
        id: "q4",
        sourceId: "005",
        audio: {
          original: `${MUSIC_BASE}/original_audio/005.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/harmony/q4_harmony_+7semitone_005_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/harmony/q4_harmony_+4semitone_005_edit_2.wav`,
        },
      },
      {
        id: "q5",
        sourceId: "006",
        audio: {
          original: `${MUSIC_BASE}/original_audio/006.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/harmony/q5_harmony_+5semitone_006_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/harmony/q5_harmony_+6semitone_006_edit_2.wav`,
        },
      },
    ],
  },
  {
    id: "rhythm",
    label: "Rhythm & Meter",
    definition:
      "Rhythm & Meter refers to the temporal structure of a piece — how fast the music moves (tempo), where the beats fall in time, and how steadily the rhythmic pulse is maintained across the piece.",
    focus: [
      "The overall tempo or speed of the music (does the edited clip feel like it moves at the same pace as the original?)",
      "The placement and regularity of beats (do the beats land at the expected moments, or do they feel shifted, rushed, or dragged?)",
      "The steadiness of the rhythmic pulse (does the music maintain a stable groove, or does it feel uneven, jittery, or unstable?)",
    ],
    ignore: ["pitch or harmony", "timbre", "instrumentation"],
    prompt:
      "Which edited clip is farther from the original in terms of rhythm and meter?",
    example: {
      clips: [
        { clip: "Original", edit: "no edit" },
        { clip: "A", edit: "no edit (identical to original)" },
        { clip: "B", edit: "tempo shifted +50%" },
      ],
      audio: {
        original: `${MUSIC_BASE}/original_audio/007.wav`,
        clipA: `${MUSIC_BASE}/example/edit_1_audio/rhythm/example_rhythm_identical_007_edit_1.wav`,
        clipB: `${MUSIC_BASE}/example/edit_2_audio/rhythm/example_rhythm_tempo+50_007_edit_2.wav`,
      },
      correctAnswer: "B is farther from the original.",
      explanation:
        'Clip A is identical to the original. Clip B has been sped up by 50%, making the music feel noticeably faster and changing where every beat lands. Therefore B is farther from the original in terms of rhythm & meter.',
    },
    questions: [
      {
        id: "q1",
        sourceId: "008",
        audio: {
          original: `${MUSIC_BASE}/original_audio/008.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/rhythm/q1_rhythm_tempo+10_008_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/rhythm/q1_rhythm_tempo+40_008_edit_2.wav`,
        },
      },
      {
        id: "q2",
        sourceId: "009",
        audio: {
          original: `${MUSIC_BASE}/original_audio/009.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/rhythm/q2_rhythm_tempo+5_009_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/rhythm/q2_rhythm_tempo+30_009_edit_2.wav`,
        },
      },
      {
        id: "q3",
        sourceId: "010",
        audio: {
          original: `${MUSIC_BASE}/original_audio/010.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/rhythm/q3_rhythm_offset+150ms_010_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/rhythm/q3_rhythm_jitter80ms_010_edit_2.wav`,
        },
      },
      {
        id: "q4",
        sourceId: "011",
        audio: {
          original: `${MUSIC_BASE}/original_audio/011.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/rhythm/q4_rhythm_decel15_011_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/rhythm/q4_rhythm_offset+50ms_011_edit_2.wav`,
        },
      },
    ],
  },
  {
    id: "structural",
    label: "Structural Form",
    definition:
      "Structural Form refers to how a piece of music is organized at a large scale — how it is divided into distinct sections (such as verse, chorus, or bridge), whether those sections repeat or contrast with each other, and how clearly the boundaries between sections are marked.",
    focus: [
      "The number and placement of section boundaries (does the edited clip divide into sections at roughly the same moments as the original, or do the transitions feel shifted, missing, or added?)",
      "The repetition and contrast pattern of sections (does the edited clip follow the same large-scale pattern as the original — for example, does a section that repeated in the original still repeat, and does a section that contrasted still contrast?)",
      "The distinctiveness of section boundaries (are the transitions between sections equally clear and noticeable, or do they feel blurred or abrupt compared to the original?)",
    ],
    ignore: ["small note-level changes", "local timing variations", "timbre"],
    prompt:
      "Which edited clip is farther from the original in terms of structural form?",
    example: {
      clips: [
        { clip: "Original", edit: "no edit (ABC)" },
        { clip: "A", edit: "no edit (identical to original)" },
        { clip: "B", edit: "AAA (all three sections replaced with repetitions of section A)" },
      ],
      audio: {
        original: `${MUSIC_BASE}/original_audio/013.wav`,
        clipA: `${MUSIC_BASE}/example/edit_1_audio/structural/example_structural_ABC_013_edit_1.wav`,
        clipB: `${MUSIC_BASE}/example/edit_2_audio/structural/example_structural_AAA_013_edit_2.wav`,
      },
      correctAnswer: "B is farther from the original.",
      explanation:
        'Clip A is identical to the original. In Clip B, the two contrasting sections have been replaced with repetitions of the opening section — the music no longer has any contrast, and the entire clip sounds the same throughout. Therefore B is farther from the original in terms of structural form.',
    },
    questions: [
      {
        id: "q1",
        sourceId: "014",
        audio: {
          original: `${MUSIC_BASE}/original_audio/014.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/structural/q1_structural_ABA_014_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/structural/q1_structural_AAA_014_edit_2.wav`,
        },
      },
      {
        id: "q2",
        sourceId: "015",
        audio: {
          original: `${MUSIC_BASE}/original_audio/015.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/structural/q2_structural_CBA_015_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/structural/q2_structural_ABB_015_edit_2.wav`,
        },
      },
      {
        id: "q3",
        sourceId: "016",
        audio: {
          original: `${MUSIC_BASE}/original_audio/016.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/structural/q3_structural_ABB_016_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/structural/q3_structural_BBB_016_edit_2.wav`,
        },
      },
      {
        id: "q4",
        sourceId: "017",
        audio: {
          original: `${MUSIC_BASE}/original_audio/017.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/structural/q4_structural_ACB_017_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/structural/q4_structural_AAB_017_edit_2.wav`,
        },
      },
    ],
  },
  {
    id: "melodic",
    label: "Melodic Content & Motifs",
    definition:
      'Melodic content refers to the shape and movement of the main tune — the sequence of pitches that rises and falls over time and forms the part of the music you would typically hum or sing along to. Motifs are short, recognizable melodic fragments (usually just a few notes) that recur throughout a piece and give it its identity — the "hook" or the little melodic idea you remember after listening.',
    focus: [
      "The overall shape of the main melody — does the tune rise and fall in the same way as the original?",
      'Whether the recurring short melodic fragments (motifs) from the original are still recognizable in the edited clip — can you still hear the same "little melodic ideas" coming back?',
      "The sequence of intervals between consecutive notes of the melody — does the melody move by the same steps and leaps as the original?",
    ],
    ignore: ["pitch shift or transposition", "tempo changes", "instrumentation"],
    prompt:
      "Which edited clip is farther from the original in terms of melodic content and motifs?",
    example: {
      clips: [
        { clip: "Original", edit: "no edit" },
        {
          clip: "A",
          edit: "Melodic inversion (every interval direction of the main melody flipped: ascending becomes descending and vice versa)",
        },
        { clip: "B", edit: "+5 semitones (whole piece transposed up by a perfect 4th)" },
      ],
      audio: {
        original: `${MUSIC_BASE}/original_audio/019.wav`,
        clipA: `${MUSIC_BASE}/example/edit_1_audio/melodic/example_melodic_fullinv_019_edit_1.wav`,
        clipB: `${MUSIC_BASE}/example/edit_2_audio/melodic/example_melodic_+5semitone_019_edit_2.wav`,
      },
      correctAnswer: "A is farther from the original.",
      explanation:
        'Clip B only shifts the entire piece to a different pitch level — the rise-and-fall shape and all recurring motifs are fully preserved, which we treat as negligible for melodic content. Clip A inverts every interval direction of the main melody, so the original ascending themes now descend and vice versa; the melodic shape and motifs are no longer recognizable. Therefore A is farther from the original.',
    },
    questions: [
      {
        id: "q1",
        sourceId: "020",
        audio: {
          original: `${MUSIC_BASE}/original_audio/020.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/melodic/q1_melodic_fullinv_020_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/melodic/q1_melodic_+3semitone_020_edit_2.wav`,
        },
      },
      {
        id: "q2",
        sourceId: "021",
        audio: {
          original: `${MUSIC_BASE}/original_audio/021.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/melodic/q2_melodic_fullinv_021_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/melodic/q2_melodic_halfinv_021_edit_2.wav`,
        },
      },
      {
        id: "q3",
        sourceId: "022",
        audio: {
          original: `${MUSIC_BASE}/original_audio/022.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/melodic/q3_melodic_intervalx3_022_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/melodic/q3_melodic_retrograde_022_edit_2.wav`,
        },
      },
      {
        id: "q4",
        sourceId: "023",
        audio: {
          original: `${MUSIC_BASE}/original_audio/023.wav`,
          clipA: `${MUSIC_BASE}/edit_1_audio/melodic/q4_melodic_+7semitone_023_edit_1.wav`,
          clipB: `${MUSIC_BASE}/edit_2_audio/melodic/q4_melodic_-5semitone_023_edit_2.wav`,
        },
      },
    ],
  },
];

// Split 0 (Jan–Jun): q1, q3 from each section
// Split 1 (Jul–Dec): q2, q4 from each section
export const SPLITS = [
  { name: "Jan–Jun", questionIndices: [0, 2] },
  { name: "Jul–Dec", questionIndices: [1, 3] },
];

export const QUESTIONS_PER_SECTION = 2;

export const STORAGE_KEY = "musicQuestionnaireSession.v11";
export const COMPLETED_KEY = "musicQuestionnaireCompleted.v11";
export const PENDING_PARTICIPANT_KEY =
  "musicQuestionnairePendingParticipantId.v1";
export const START_DRAFT_KEY = "musicQuestionnaireStartDraft.v1";
