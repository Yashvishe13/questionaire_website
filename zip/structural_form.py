from typing import Dict, Any, Optional, Tuple
import numpy as np
import mir_eval
from scipy.signal import find_peaks
from sklearn.cluster import KMeans
import librosa
from utils import _safe_float

# =========================================================
# HYPERPARAMETERS
# =========================================================

SAMPLE_RATE = 22050
N_MFCC = 13
HOP_LENGTH = 512

NOVELTY_SMOOTH_WINDOW = 16
PEAK_MIN_DISTANCE_SEC = 10.0
PEAK_PROMINENCE = 0.1

FALLBACK_SEGMENT_SEC = 10.0
MIN_SEGMENTS_FALLBACK = 3

BOUNDARY_WINDOW_SEC = 0.5
BOUNDARY_SHIFT_SEARCH_RANGE_SEC = 2.0
BOUNDARY_SHIFT_STEP_SEC = 0.02

MIN_INTERVAL_DURATION = 1e-10

MAX_KMEANS_CLUSTERS = 8
MIN_KMEANS_CLUSTERS = 2
KMEANS_RANDOM_STATE = 0
KMEANS_N_INIT = 10

STRUCTURE_BOUNDARY_WEIGHT = 0.7
STRUCTURE_ARI_WEIGHT = 0.3

DEFAULT_FALLBACK_DURATION = 30.0

# =========================================================
# INTERNAL HELPERS
# =========================================================

def _bounds_to_intervals(bounds) -> np.ndarray:
    bounds = np.asarray(bounds, dtype=float)

    if bounds.ndim == 1:
        bounds = bounds[np.isfinite(bounds)]
        bounds = np.unique(bounds)
        if bounds.size < 2:
            return np.empty((0, 2), dtype=float)
        return np.column_stack([bounds[:-1], bounds[1:]])

    if bounds.size == 0:
        return np.empty((0, 2), dtype=float)

    bounds = bounds.astype(float, copy=False)
    if bounds.shape[1] != 2:
        return np.empty((0, 2), dtype=float)

    keep = np.isfinite(bounds).all(axis=1) & ((bounds[:, 1] - bounds[:, 0]) > MIN_INTERVAL_DURATION)
    return bounds[keep]


def _shift_intervals(intervals: np.ndarray, delta: float) -> np.ndarray:
    intervals = np.asarray(intervals, dtype=float)
    if intervals.size == 0:
        return intervals
    return intervals + np.array([delta, delta], dtype=float)


def _crop_overlap_for_detection(
    ref_intervals: np.ndarray,
    est_intervals: np.ndarray,
) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
    ref_intervals = np.asarray(ref_intervals, dtype=float)
    est_intervals = np.asarray(est_intervals, dtype=float)

    if ref_intervals.size == 0 or est_intervals.size == 0:
        return None, None

    t_min = max(0.0, float(ref_intervals[0, 0]), float(est_intervals[0, 0]))
    t_max = min(float(ref_intervals[-1, 1]), float(est_intervals[-1, 1]))

    if not (t_max > t_min):
        return None, None

    def _clip_valid(intervals: np.ndarray) -> Optional[np.ndarray]:
        if intervals.size == 0:
            return None

        starts = np.maximum(intervals[:, 0], t_min)
        ends = np.minimum(intervals[:, 1], t_max)
        keep = (ends - starts) > MIN_INTERVAL_DURATION

        if not np.any(keep):
            return None

        clipped = np.column_stack([starts[keep], ends[keep]])

        # normalize to start at 0 for mir_eval stability
        clipped = clipped - np.array([t_min, t_min], dtype=float)
        return clipped

    ref_clipped = _clip_valid(ref_intervals)
    est_clipped = _clip_valid(est_intervals)

    if ref_clipped is None or est_clipped is None:
        return None, None

    return ref_clipped, est_clipped


def _merge_short_segments(
    bounds: np.ndarray,
    labels: list,
    min_duration: float = 2.0,
) -> Tuple[np.ndarray, list]:
    bounds = np.asarray(bounds, dtype=float)
    if bounds.ndim != 1 or bounds.size < 2:
        return bounds, labels

    intervals = _bounds_to_intervals(bounds)
    if len(intervals) == 0 or len(labels) != len(intervals):
        return bounds, labels

    new_bounds = [float(bounds[0])]
    new_labels = []

    cur_start = float(bounds[0])
    cur_end = float(bounds[1])
    cur_label = labels[0]

    for i in range(1, len(labels)):
        seg_start = float(bounds[i])
        seg_end = float(bounds[i + 1])
        seg_label = labels[i]

        cur_duration = cur_end - cur_start

        if cur_duration < min_duration or seg_label == cur_label:
            cur_end = seg_end
        else:
            new_bounds.append(cur_end)
            new_labels.append(cur_label)
            cur_start = seg_start
            cur_end = seg_end
            cur_label = seg_label

    new_bounds.append(cur_end)
    new_labels.append(cur_label)

    new_bounds = np.asarray(new_bounds, dtype=float)
    return new_bounds, new_labels


# =========================================================
# PUBLIC HELPERS
# =========================================================

def best_boundary_shift(
    ref_bounds,
    est_bounds,
    window: float = BOUNDARY_WINDOW_SEC,
    search_range: float = BOUNDARY_SHIFT_SEARCH_RANGE_SEC,
    step: float = BOUNDARY_SHIFT_STEP_SEC,
):
    ref_intervals = _bounds_to_intervals(ref_bounds)
    est_intervals = _bounds_to_intervals(est_bounds)

    best = {"F": -1.0, "delta": 0.0, "P": 0.0, "R": 0.0}

    if ref_intervals.size == 0 or est_intervals.size == 0:
        return best

    for delta in np.arange(-search_range, search_range + 1e-12, step):
        est_shifted = _shift_intervals(est_intervals, delta)
        ref_crop, est_crop = _crop_overlap_for_detection(ref_intervals, est_shifted)

        if ref_crop is None or est_crop is None:
            continue

        try:
            precision, recall, f_measure = mir_eval.segment.detection(
                ref_crop, est_crop, window=window, trim=True
            )
        except Exception:
            continue

        if f_measure > best["F"]:
            best.update({
                "F": float(f_measure),
                "delta": float(delta),
                "P": float(precision),
                "R": float(recall),
            })

    if best["F"] < 0.0:
        best = {"F": 0.0, "delta": 0.0, "P": 0.0, "R": 0.0}

    return best


def bounds_to_intervals(bounds: np.ndarray) -> np.ndarray:
    return _bounds_to_intervals(bounds)


def crop_to_overlap(intervals, labels, t_min, t_max):
    intervals = np.asarray(intervals, dtype=float)

    if intervals.size == 0:
        return intervals, ([] if labels is not None else None)

    starts = np.maximum(intervals[:, 0], t_min)
    ends = np.minimum(intervals[:, 1], t_max)
    keep = (ends - starts) > MIN_INTERVAL_DURATION

    intervals_cropped = np.column_stack([starts[keep], ends[keep]])

    if intervals_cropped.size == 0:
        return np.empty((0, 2), dtype=float), ([] if labels is not None else None)

    # normalize to start at 0 for mir_eval.segment.pairwise / ari
    intervals_cropped = intervals_cropped - np.array([t_min, t_min], dtype=float)

    labels_cropped = None
    if labels is not None:
        labels_array = np.asarray(labels, dtype=object)
        labels_cropped = labels_array[keep].tolist()

        if len(labels_cropped) < len(intervals_cropped):
            filler = labels_cropped[-1] if labels_cropped else "S"
            labels_cropped += [filler] * (len(intervals_cropped) - len(labels_cropped))
        elif len(labels_cropped) > len(intervals_cropped):
            labels_cropped = labels_cropped[:len(intervals_cropped)]

    return intervals_cropped, labels_cropped


def mir_segment_metrics(ref_bounds, est_bounds, ref_labels=None, est_labels=None):
    ref_intervals = bounds_to_intervals(ref_bounds)
    est_intervals = bounds_to_intervals(est_bounds)

    if ref_intervals.size == 0 or est_intervals.size == 0:
        return {"boundary_p": 0.0, "boundary_r": 0.0, "boundary_f": 0.0}

    t_min = max(float(ref_intervals[0, 0]), float(est_intervals[0, 0]), 0.0)
    t_max = min(float(ref_intervals[-1, 1]), float(est_intervals[-1, 1]))

    if not (t_max > t_min):
        return {"boundary_p": 0.0, "boundary_r": 0.0, "boundary_f": 0.0}

    ref_cropped, ref_labels_cropped = crop_to_overlap(ref_intervals, ref_labels, t_min, t_max)
    est_cropped, est_labels_cropped = crop_to_overlap(est_intervals, est_labels, t_min, t_max)

    if ref_cropped.size == 0 or est_cropped.size == 0:
        return {"boundary_p": 0.0, "boundary_r": 0.0, "boundary_f": 0.0}

    precision, recall, f_measure = mir_eval.segment.detection(
        ref_cropped,
        est_cropped,
        window=BOUNDARY_WINDOW_SEC,
        trim=True,
    )

    out = {
        "boundary_p": float(precision),
        "boundary_r": float(recall),
        "boundary_f": float(f_measure),
    }

    labels_ok = (
        ref_labels_cropped is not None
        and est_labels_cropped is not None
        and len(ref_labels_cropped) == len(ref_cropped)
        and len(est_labels_cropped) == len(est_cropped)
    )

    if labels_ok:
        try:
            p_pair, r_pair, f_pair = mir_eval.segment.pairwise(
                ref_cropped, ref_labels_cropped, est_cropped, est_labels_cropped
            )
            out.update({
                "pairwise_p": float(p_pair),
                "pairwise_r": float(r_pair),
                "pairwise_f": float(f_pair),
            })
        except Exception as exc:
            out["pairwise_error"] = str(exc)

        try:
            ari = mir_eval.segment.ari(
                ref_cropped, ref_labels_cropped, est_cropped, est_labels_cropped
            )
            out["ari"] = float(ari)
        except Exception as exc:
            out["ari_error"] = str(exc)

    return out


# =========================================================
# SEGMENT EXTRACTION
# =========================================================

def librosa_segments(audio_path: str):
    try:
        y, sr = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)
        duration = float(len(y)) / float(sr)

        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=N_MFCC, hop_length=HOP_LENGTH)

        recurrence = librosa.segment.recurrence_matrix(
            mfcc, mode="affinity", sym=True
        )
        novelty = librosa.segment.recurrence_to_lag(recurrence, pad=True)
        novelty = np.max(novelty, axis=0)

        smooth_window = np.hanning(NOVELTY_SMOOTH_WINDOW)
        if smooth_window.sum() > 0:
            smooth_window = smooth_window / smooth_window.sum()
        novelty = np.convolve(novelty, smooth_window, mode="same")

        frame_duration = HOP_LENGTH / sr
        min_peak_distance = max(1, int(PEAK_MIN_DISTANCE_SEC / frame_duration))

        peaks, _ = find_peaks(
            novelty,
            distance=min_peak_distance,
            prominence=PEAK_PROMINENCE,
        )

        bound_times = np.r_[0.0, peaks * frame_duration, duration]
        bound_times = np.clip(bound_times, 0.0, duration)
        bound_times = np.unique(bound_times)

        intervals = _bounds_to_intervals(bound_times)
        n_segments = len(intervals)

        if n_segments < 2:
            bound_times = np.linspace(
                0.0,
                duration,
                max(MIN_SEGMENTS_FALLBACK, int(duration / FALLBACK_SEGMENT_SEC) + 1),
            )
            intervals = _bounds_to_intervals(bound_times)
            n_segments = len(intervals)

        seg_features = []
        for start, end in intervals:
            start_frame = int(start / frame_duration)
            end_frame = max(start_frame + 1, int(end / frame_duration))
            end_frame = min(end_frame, mfcc.shape[1])

            segment_slice = mfcc[:, start_frame:end_frame]
            if segment_slice.size == 0:
                seg_features.append(np.zeros((N_MFCC,), dtype=float))
            else:
                seg_features.append(np.mean(segment_slice, axis=1))

        seg_features = np.asarray(seg_features, dtype=float)

        n_clusters = min(
            MAX_KMEANS_CLUSTERS,
            max(MIN_KMEANS_CLUSTERS, n_segments // 2),
        )

        if len(seg_features) < n_clusters:
            n_clusters = max(1, len(seg_features))

        if n_clusters <= 1:
            labels = ["S0"] * max(1, n_segments)
            return bound_times, labels

        kmeans = KMeans(
            n_clusters=n_clusters,
            random_state=KMEANS_RANDOM_STATE,
            n_init=KMEANS_N_INIT,
        ).fit(seg_features)

        labels = [f"S{cluster}" for cluster in kmeans.labels_]

        bound_times, labels = _merge_short_segments(bound_times, labels, min_duration=2.0)
        return bound_times, labels

    except Exception:
        try:
            y, sr = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)
            duration = float(len(y)) / float(sr)
        except Exception:
            duration = DEFAULT_FALLBACK_DURATION

        n_segments = max(MIN_KMEANS_CLUSTERS, int(duration / FALLBACK_SEGMENT_SEC))
        bounds = np.linspace(0.0, duration, n_segments + 1)
        labels = [f"S{i}" for i in range(n_segments)]
        return bounds, labels


# =========================================================
# MAIN API
# =========================================================

def structural_score(audio_ref: str, audio_est: str) -> Dict[str, Any]:
    ref_bounds, ref_labels = librosa_segments(audio_ref)
    est_bounds, est_labels = librosa_segments(audio_est)

    best = best_boundary_shift(
        ref_bounds,
        est_bounds,
        window=BOUNDARY_WINDOW_SEC,
        search_range=BOUNDARY_SHIFT_SEARCH_RANGE_SEC,
        step=BOUNDARY_SHIFT_STEP_SEC,
    )

    est_bounds_shifted = np.asarray(est_bounds, dtype=float) + best["delta"]
    scores = mir_segment_metrics(ref_bounds, est_bounds_shifted, ref_labels, est_labels)

    boundary_f_after_shift = max(0.0, _safe_float(best["F"]) if "safe_float" in globals() else float(best["F"]))
    ari = float(scores.get("ari", 0.0)) if np.isfinite(scores.get("ari", 0.0)) else 0.0 # ari

    scores.update({
        "best_boundary_shift_sec": float(best["delta"]),
        "boundary_f_after_shift": float(boundary_f_after_shift),    # boundary F-measure
        "structural_form_score": float(
            STRUCTURE_BOUNDARY_WEIGHT * boundary_f_after_shift
            + STRUCTURE_ARI_WEIGHT * ari
        ),
        "ari": float(ari),
    })

    return scores