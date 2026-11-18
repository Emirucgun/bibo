"""Learner-model comparison (research prototype, not product code).

Run from the repo root:  python3 docs/arastirma/sim/ogrenen_modeli.py [learners] [random|product|uncertainty]
Optional env A_HAT=1.3 gives the estimator the true item discrimination.

M0  current engine: per (topic, skill) EMA, prior 0.50 - 0.15*l1_risk, alpha 0.15 (recognition) / 0.25,
    bands: n=0 unknown, <0.45 weak, <0.70 developing, else solid  (docs/SPEC.md 4.1)
M1  proposed: hierarchical Bayesian logistic model
        eta = theta_g + s_skill + d_topic + e_topic,skill - b_topic - mode_offset
    with a Gaussian posterior over all latent terms, updated online after every answer by
    assumed-density filtering (moment matching, as in TrueSkill / Glicko-style Bayesian rating),
    4PL likelihood (guessing for recognition items, 3% slips), process noise between sessions.
    Labels: solid if P(mastered) >= .8, weak if P(gap) >= .8, developing if the posterior is tight,
    otherwise uncertain.

Truth: a simulated learner with the same additive structure; "mastered" = P(correct on a controlled item) >= .8,
"gap" = P(correct) <= .5.
"""
import csv
import math
import os
import sys
from pathlib import Path

import numpy as np

TOPIC_ROWS = [r for r in csv.DictReader(open(Path(__file__).resolve().parents[3] / "supabase/seed/topics.csv", encoding="utf-8"))
              if r["kind"] == "grammar" and r["active"] == "true"]
TOPICS = [r["id"] for r in TOPIC_ROWS]
T = len(TOPICS)
TIDX = {t: i for i, t in enumerate(TOPICS)}
LEVEL = np.array([0.0 if r["level"] == "A1" else 1.0 for r in TOPIC_ROWS])
L1RISK = np.array([int(r["l1_risk"]) for r in TOPIC_ROWS])
SKILLS = ["reading", "listening", "writing", "speaking"]
K = len(SKILLS)
TYPES = {  # (activity, mode)
    0: [("mcq_read", "recognition")],
    1: [("listen_choose", "recognition"), ("dictation", "controlled")],
    2: [("gap_fill", "controlled"), ("word_order", "controlled"), ("translate_tr_en", "free"), ("short_write", "free")],
    3: [("speak_answer", "free")],
}
MODE_OFF = {"recognition": -0.4, "controlled": 0.0, "free": 0.4}
GUESS = {"recognition": 0.30, "controlled": 0.02, "free": 0.0}
SLIP_D = 0.97
A_TRUE = 1.3
B_TOPIC = np.where(LEVEL == 0, -0.75, 0.75) + 0.25 * (L1RISK - 1)  # topic difficulty (controlled item)
MASTERED_P, GAP_P = 0.8, 0.5
GATE_CUT = 1.5  # A2|B1 on the theta scale

PLACEMENT = [  # current 14-item placement, grammar items only (topic, skill, mode)
    ("g.be_present", 0, "recognition"), ("g.subject_pronouns", 0, "recognition"), ("g.do_does_q_neg", 0, "recognition"),
    ("g.wh_questions", 0, "recognition"), ("g.present_simple", 0, "recognition"), ("g.present_perfect", 0, "recognition"),
    ("g.present_simple_3sg", 2, "controlled"), ("g.articles_a_an", 2, "controlled"), ("g.plurals", 2, "controlled"),
    ("g.prep_time", 2, "controlled"), ("g.word_order_svo", 2, "controlled"), ("g.present_simple", 3, "free"),
]


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def p_correct(eta, mode, a=A_TRUE):
    c = GUESS[mode]
    return c + (SLIP_D - c) * sigmoid(a * eta)


# ------------------------------------------------------------------ simulated learners
class Learner:
    def __init__(self, kind, rng):
        self.kind = kind
        self.s = rng.normal(0, 0.15, K)
        self.d = rng.normal(0, 0.25, T)
        self.e = rng.normal(0, 0.15, (T, K))
        if kind == "B2":
            self.g = rng.normal(3.0, 0.3)
        elif kind == "B1":
            self.g = rng.normal(2.1, 0.25)
        elif kind == "A2gaps":
            self.g = rng.normal(0.9, 0.2)
            for t in ["g.articles_the", "g.present_simple_3sg", "g.present_perfect"]:
                self.d[TIDX[t]] = -1.6  # genuine topic gaps
            self.e[TIDX["g.past_simple_irregular"], 3] = -2.0  # knows it, cannot say it (speaking gap)
            self.e[TIDX["g.do_does_q_neg"], 3] = -2.0
        elif kind == "A1":
            self.g = rng.normal(-0.9, 0.3)
            self.d = rng.normal(0, 0.45, T)
        self.item_sd = 0.3
        self.planted = np.zeros((T, K), bool)
        if kind == "A2gaps":
            for t in ["g.articles_the", "g.present_simple_3sg", "g.present_perfect"]:
                self.planted[TIDX[t], :] = True
            self.planted[TIDX["g.past_simple_irregular"], 3] = True
            self.planted[TIDX["g.do_does_q_neg"], 3] = True

    def eta(self, t, k):
        return self.g + self.s[k] + self.d[t] + self.e[t, k] - B_TOPIC[t]

    def answer(self, t, k, mode, rng):
        eta = self.eta(t, k) - MODE_OFF[mode] + rng.normal(0, self.item_sd)
        return rng.random() < p_correct(eta, mode)

    def truth(self):
        p = p_correct(np.array([[self.eta(t, k) for k in range(K)] for t in range(T)]), "controlled")
        return np.where(p >= MASTERED_P, 2, np.where(p <= GAP_P, 0, 1)), p  # 2 mastered, 1 developing, 0 gap


# ------------------------------------------------------------------ M0: current EMA engine
class EMA:
    def __init__(self):
        self.m = np.tile((0.5 - 0.15 * L1RISK)[:, None], (1, K)).astype(float)
        self.n = np.zeros((T, K), int)

    def update(self, t, k, mode, ok):
        alpha = 0.15 if mode == "recognition" else 0.25
        self.m[t, k] += alpha * ((1.0 if ok else 0.0) - self.m[t, k])
        self.n[t, k] += 1

    def labels(self):  # 2 solid, 1 developing, 0 weak, -1 unknown
        lab = np.where(self.m >= 0.7, 2, np.where(self.m >= 0.45, 1, 0))
        return np.where(self.n == 0, -1, lab)

    def pred_p(self):
        return self.m


# ------------------------------------------------------------------ M1: hierarchical Bayesian, ADF updates
GH_X, GH_W = np.polynomial.hermite.hermgauss(40)


class Hier:
    A_HAT = float(os.environ.get("A_HAT", "1.0"))  # default deliberately misspecified (true 1.3)

    def __init__(self, rng, b_err=0.3, prior_g=(0.25, 1.6), tau_s=0.4, tau_d=0.6, tau_e=0.4):
        self.D = 1 + K + T + T * K
        self.mu = np.zeros(self.D)
        self.mu[0] = prior_g[0]
        var = np.concatenate([[prior_g[1] ** 2], np.full(K, tau_s ** 2), np.full(T, tau_d ** 2), np.full(T * K, tau_e ** 2)])
        self.S = np.diag(var)
        self.b_hat = B_TOPIC + rng.normal(0, b_err, T)  # topic difficulty known only roughly (CEFR level + L1 risk)
        self.n = np.zeros((T, K), int)

    def w(self, t, k):
        v = np.zeros(self.D)
        v[0] = 1
        v[1 + k] = 1
        v[1 + K + t] = 1
        v[1 + K + T + t * K + k] = 1
        return v

    def eta_moments(self, t, k):
        idx = [0, 1 + k, 1 + K + t, 1 + K + T + t * K + k]
        m = self.mu[idx].sum() - self.b_hat[t]
        v = self.S[np.ix_(idx, idx)].sum()
        return m, v

    def update(self, t, k, mode, ok):
        idx = np.array([0, 1 + k, 1 + K + t, 1 + K + T + t * K + k])
        m = self.mu[idx].sum() - self.b_hat[t] - MODE_OFF[mode]
        Sw = self.S[:, idx].sum(axis=1)
        v = Sw[idx].sum()
        eta = m + math.sqrt(2 * v) * GH_X
        c = 1 / 3 if mode == "recognition" else 0.0
        lik = c + (SLIP_D - c) * sigmoid(self.A_HAT * eta)
        if not ok:
            lik = 1 - lik
        wts = GH_W * lik
        Z = wts.sum()
        m_new = (wts * eta).sum() / Z
        v_new = (wts * eta ** 2).sum() / Z - m_new ** 2
        self.mu += Sw * (m_new - m) / v
        self.S -= np.outer(Sw, Sw) * (v - v_new) / v ** 2
        self.n[t, k] += 1

    def observe_global(self, y, sd):
        Sw = self.S[:, 0].copy()
        v = self.S[0, 0] + sd ** 2
        self.mu += Sw * (y - self.mu[0]) / v
        self.S -= np.outer(Sw, Sw) / v

    def drift(self, days):
        q = np.concatenate([[0.002], np.full(K, 0.0005), np.full(T, 0.003), np.full(T * K, 0.002)]) * days
        self.S[np.diag_indices(self.D)] += q

    def cell_probs(self):
        thr_m = math.log((MASTERED_P) / (1 - MASTERED_P)) / self.A_HAT  # eta for p = .8 (controlled, c=0)
        P_m = np.zeros((T, K))
        P_g = np.zeros((T, K))
        sd = np.zeros((T, K))
        mean = np.zeros((T, K))
        for t in range(T):
            for k in range(K):
                m, v = self.eta_moments(t, k)
                s = math.sqrt(v)
                P_m[t, k] = 0.5 * math.erfc(-(m - thr_m) / (s * math.sqrt(2)))
                P_g[t, k] = 0.5 * math.erfc((m - 0.0) / (s * math.sqrt(2)))
                sd[t, k], mean[t, k] = s, m
        return P_m, P_g, sd, mean

    def labels(self):
        P_m, P_g, sd, _ = self.cell_probs()
        evidenced = (self.n.sum(axis=1) >= 2)[:, None]  # "no verdict without evidence": >= 2 answers on the topic
        lab = np.where(P_m >= 0.8, 2, np.where((P_m <= 0.2) & evidenced, 0, np.where(sd <= 0.6, 1, -1)))
        return lab

    def pred_p(self):
        _, _, _, mean = self.cell_probs()
        return p_correct(mean, "controlled", a=self.A_HAT)

    def p_above(self, cut=GATE_CUT):
        return 0.5 * math.erfc(-(self.mu[0] - cut) / (math.sqrt(self.S[0, 0]) * math.sqrt(2)))


# ------------------------------------------------------------------ simulation loop
def product_slots(rng, model, n=9):
    P_m, _, _, _ = model.cell_probs()
    need = 1 - P_m.min(axis=1) + 0.05 * rng.random(T)
    F = int(np.argmax(need))
    ks = list(np.argsort(P_m[F] + 0.01 * rng.random(K))[:3])
    slots = [(F, int(k)) for k in ks]
    unc = -np.abs(P_m - 0.5) + 0.02 * rng.random((T, K))
    unc[F, :] = -9
    for flat in np.argsort(unc, axis=None)[::-1][:3]:
        t, k = np.unravel_index(flat, unc.shape)
        slots.append((int(t), int(k)))
    while len(slots) < n:
        slots.append((int(rng.integers(T)), int(rng.integers(K))))
    out = []
    for t, k in slots:
        act, mode = TYPES[k][rng.integers(len(TYPES[k]))]
        out.append((t, k, mode))
    return out


def pick_slot(rng, model, policy):
    if policy == "uncertainty" and isinstance(model, Hier):
        P_m, P_g, sd, _ = model.cell_probs()
        undecided = (1 - np.abs(2 * P_m - 1)) * sd  # open verdict AND still learnable (stop probing tight borderline cells)
        score = undecided + 0.05 * rng.random((T, K))
        t, k = np.unravel_index(np.argmax(score), score.shape)
    else:
        t, k = rng.integers(T), rng.integers(K)
    act, mode = TYPES[k][rng.integers(len(TYPES[k]))]
    return int(t), int(k), mode


def run(kind, n_learners=60, sessions=40, slots=9, policy="random", seed=0):
    rng = np.random.default_rng(seed)
    checkpoints = [0, 1, 3, 5, 10, 20, 40]
    stats = {m: {c: [] for c in checkpoints} for m in ["M0", "M1", "M1+"]}
    gate_session = []
    for _ in range(n_learners):
        L = Learner(kind, rng)
        truth, p_true = L.truth()
        models = {"M0": EMA(), "M1": Hier(rng), "M1+": Hier(rng)}
        for (t, k, mode) in PLACEMENT:
            ok = L.answer(TIDX[t], k, mode, rng)
            for mdl in models.values():
                mdl.update(TIDX[t], k, mode, ok)
        models["M1+"].observe_global(L.g + rng.normal(0, 0.4), 0.4)
        gated = None
        if models["M1+"].p_above() >= 0.9:
            gated = 0
        for s in range(sessions + 1):
            if s in checkpoints:
                for name, mdl in models.items():
                    lab = mdl.labels()
                    stats[name][s].append(metrics(lab, truth, mdl.pred_p(), p_true, L.planted))
            if s == sessions:
                break
            models["M1"].drift(1.0)
            models["M1+"].drift(1.0)
            plan = product_slots(rng, models["M1+"], slots) if policy == "product" else [pick_slot(rng, models["M1+"], policy) for _ in range(slots)]
            for t, k, mode in plan:
                ok = L.answer(t, k, mode, rng)
                for mdl in models.values():
                    mdl.update(t, k, mode, ok)
            if gated is None and models["M1+"].p_above() >= 0.9:
                gated = s + 1
        gate_session.append(gated)
    return stats, gate_session


def metrics(lab, truth, pred_p, p_true, planted):
    mastered, gap = truth == 2, truth == 0
    clear = p_true <= 0.35
    plant = planted & gap
    notm = truth != 2
    out = {
        "clear_gap_recall": (lab[clear] == 0).mean() if clear.any() else np.nan,
        "planted_recall": (lab[plant] == 0).mean() if plant.any() else np.nan,
        "notm_recall": (lab[notm] == 0).mean() if notm.any() else np.nan,
        "solid_precision": (truth[lab == 2] == 2).mean() if (lab == 2).any() else np.nan,
        "false_weak": (lab[mastered] == 0).mean() if mastered.any() else np.nan,  # mastered but shown weak
        "solid_recall": (lab[mastered] == 2).mean() if mastered.any() else np.nan,
        "gap_recall": (lab[gap] == 0).mean() if gap.any() else np.nan,
        "weak_precision": (truth[lab == 0] != 2).mean() if (lab == 0).any() else np.nan,
        "n_weak": int((lab == 0).sum()),
        "rmse_p": float(np.sqrt(np.mean((pred_p - p_true) ** 2))),
        "n_mastered": int(mastered.sum()),
    }
    return out


def fmt(x):
    return "  -  " if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:5.2f}"


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    policy = sys.argv[2] if len(sys.argv) > 2 else "random"
    print(f"policy={policy}, learners per archetype={n}, 9 items/session, cells={T}x{K}={T*K}")
    for kind in ["B2", "B1", "A2gaps", "A1"]:
        stats, gates = run(kind, n_learners=n, policy=policy, seed=sum(map(ord, kind)))
        g = [x for x in gates if x is not None]
        print(f"\n== learner archetype {kind} (truly mastered cells: {np.mean([r['n_mastered'] for r in stats['M0'][0]]):.1f}/120): gate (P(theta>=B1)>=.9) reached by {len(g)}/{len(gates)}"
              + (f", median session {int(np.median(g))}" if g else ""))
        print("model sess | false_weak solid_rec solid_prec needs_rec clear_gap planted weak_prec  #weak  rmse_p")
        for name in ["M0", "M1", "M1+"]:
            for c, rows in stats[name].items():
                avg = {key: np.nanmean([r[key] for r in rows]) if rows else np.nan for key in rows[0]}
                print(f"{name:5} {c:4} |    {fmt(avg['false_weak'])}     {fmt(avg['solid_recall'])}     {fmt(avg['solid_precision'])}     {fmt(avg['notm_recall'])}     {fmt(avg['clear_gap_recall'])}   {fmt(avg['planted_recall'])}    {fmt(avg['weak_precision'])}  {avg['n_weak']:5.1f}   {avg['rmse_p']:.3f}")


if __name__ == "__main__":
    main()
