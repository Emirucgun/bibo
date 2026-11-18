"""Monte Carlo comparison of placement procedures (research prototype, not product code).

Run from the repo root:  python3 docs/arastirma/sim/yerlestirme.py [examinees]   (needs numpy)

Latent ability theta on a logit scale. Product classes: A1 (theta < 0), A2 (0 <= theta < 1.5), B1+ (theta >= 1.5).
True response model: 4PL  P = c + (d - c) * sigmoid(a * (theta - b)).
Methods compared:
  FIXED14    current v1 test: 12 A1-band + 2 A2-band items, >= 60% correct -> A2 (never B1+)
  STAIR      user's proposal: climb after 2 straight correct; on first error ask a block at that level;
             >= 70% -> up, <= 30% -> down, else stop at that level
  CAT-SE     classic IRT CAT: max Fisher info at EAP, stop when posterior SD <= 0.35 (max 30)
  SPRT3      Eggen & Straetmans (2000) 3-category SPRT, items max-info at nearest cut (max 25)
  BCCT       Bayesian classification CAT: one-step-lookahead expected classification entropy,
             stop when max class posterior >= 0.95 (min 5, max 25)
Calibration scenarios:
  calibrated     the system knows the true item parameters
  uncalibrated   v1 reality: b_hat = b + N(0, 0.5^2), a_hat = 1, c_hat = 1/3 for MCQ, level labels from b_hat
"""
import math
import sys
import numpy as np

CUTS = np.array([0.0, 1.5])
NCLS = 3
GRID = np.linspace(-5.0, 7.0, 241)
BANDS = [("preA1", -3.0, -1.5, 20), ("A1", -1.5, 0.0, 40), ("A2", 0.0, 1.5, 40), ("B1", 1.5, 3.0, 40), ("B2", 3.0, 4.5, 20)]
LEVEL_ORDER = ["A1", "A2", "B1", "B2"]  # staircase levels (preA1 folds into A1 label)


def cls_of(theta):
    return int(np.searchsorted(CUTS, theta, side="right"))


GRID_CLS = np.searchsorted(CUTS, GRID, side="right")
CLS_MASK = np.stack([(GRID_CLS == k).astype(float) for k in range(NCLS)], axis=1)  # G x 3


def p4(theta, a, b, c, d):
    return c + (d - c) / (1.0 + np.exp(-a * (theta - b)))


def make_bank(rng):
    band, a, b, c, d, mcq = [], [], [], [], [], []
    for name, lo, hi, n in BANDS:
        for _ in range(n):
            band.append(name)
            b.append(rng.uniform(lo, hi))
            a.append(math.exp(rng.normal(math.log(1.2), 0.25)))
            is_mcq = rng.random() < 0.5
            mcq.append(is_mcq)
            c.append(rng.uniform(0.15, 0.30) if is_mcq else 0.0)
            d.append(0.98)
    return dict(band=np.array(band), a=np.array(a), b=np.array(b), c=np.array(c), d=np.array(d), mcq=np.array(mcq))


def band_of(bval):
    for name, lo, hi, _ in BANDS:
        if lo <= bval < hi:
            return name
    return "preA1" if bval < BANDS[0][1] else "B2"


def assumed_params(bank, scenario, rng):
    if scenario == "calibrated":
        return dict(a=bank["a"], b=bank["b"], c=bank["c"], d=bank["d"], band=bank["band"])
    b_hat = bank["b"] + rng.normal(0, 0.5, size=bank["b"].shape)
    return dict(
        a=np.ones_like(bank["a"]),
        b=b_hat,
        c=np.where(bank["mcq"], 1 / 3, 0.0),
        d=np.full_like(bank["d"], 0.98),
        band=np.array([band_of(x) for x in b_hat]),
    )


class Examinee:
    def __init__(self, theta, bank, rng):
        self.theta = theta
        self.p_true = p4(theta, bank["a"], bank["b"], bank["c"], bank["d"])
        self.rng = rng

    def answer(self, j):
        return self.rng.random() < self.p_true[j]


# ---------------------------------------------------------------- methods
def run_fixed14(ex, est, rng):
    a1 = np.flatnonzero(est["band"] == "A1")
    a2 = np.flatnonzero(est["band"] == "A2")
    items = list(rng.choice(a1, 12, replace=False)) + list(rng.choice(a2, 2, replace=False))
    right = sum(ex.answer(j) for j in items)
    return (1 if right / 14 >= 0.6 else 0), 14


def run_stair(ex, est, rng, advance_after=2, block_n=6, hi=0.7, lo=0.3, max_items=40):
    pools = {lv: list(rng.permutation(np.flatnonzero(est["band"] == lv))) for lv in LEVEL_ORDER}
    pools["A1"] += list(rng.permutation(np.flatnonzero(est["band"] == "preA1")))
    li, n_total = 0, 0
    passed, failed = set(), set()
    while True:
        lv = LEVEL_ORDER[li]
        asked = right = streak = 0
        errored = False
        outcome = None
        while outcome is None:
            if n_total >= max_items or not pools[lv]:
                outcome = "stop"
                break
            j = pools[lv].pop()
            ok = ex.answer(j)
            n_total += 1
            asked += 1
            right += ok
            if not errored:
                if ok:
                    streak += 1
                    if streak >= advance_after:
                        outcome = "up"
                else:
                    errored = True
            if errored and asked >= block_n:
                p = right / asked
                outcome = "up" if p >= hi else ("down" if p <= lo else "stop")
        if outcome == "up":
            passed.add(li)
            if li == len(LEVEL_ORDER) - 1 or (li + 1) in failed:
                final = li
                break
            li += 1
        elif outcome == "down":
            failed.add(li)
            if li == 0 or (li - 1) in passed:
                final = max(li - 1, 0)
                break
            li -= 1
        else:
            final = li
            break
    return min(final, 2), n_total  # A1->0, A2->1, B1/B2->2


def posterior_update(logpost, P_row, ok):
    return logpost + np.log(P_row if ok else 1.0 - P_row)


def normalize(logpost):
    w = np.exp(logpost - logpost.max())
    return w / w.sum()


def class_probs(post):
    return post @ CLS_MASK


def fisher_info(theta, a, b, c, d):
    P = p4(theta, a, b, c, d)
    num = (a ** 2) * ((P - c) ** 2) * ((d - P) ** 2)
    den = ((d - c) ** 2) * P * (1 - P)
    return num / np.maximum(den, 1e-12)


def make_P(est):
    return p4(GRID[None, :], est["a"][:, None], est["b"][:, None], est["c"][:, None], est["d"][:, None])  # J x G


def prior_logpost(mu=0.25, sd=1.6):
    return -0.5 * ((GRID - mu) / sd) ** 2


def run_cat_se(ex, est, P, rng, sd_stop=0.35, max_items=30, prior=None):
    logpost = prior_logpost() if prior is None else prior.copy()
    used = np.zeros(P.shape[0], bool)
    n = 0
    while True:
        post = normalize(logpost)
        mean = float(post @ GRID)
        sd = math.sqrt(float(post @ (GRID - mean) ** 2))
        if n >= max_items or (n >= 5 and sd <= sd_stop):
            return cls_of(mean), n
        info = fisher_info(mean, est["a"], est["b"], est["c"], est["d"])
        info[used] = -1
        j = int(np.argmax(info))
        used[j] = True
        logpost = posterior_update(logpost, P[j], ex.answer(j))
        n += 1


def entropy(q):
    q = np.clip(q, 1e-12, 1.0)
    return -(q * np.log(q)).sum(axis=-1)


def run_bcct(ex, est, P, rng, stop_p=0.95, min_items=5, max_items=25, prior=None, gate_p=0.8):
    logpost = prior_logpost() if prior is None else prior.copy()
    used = np.zeros(P.shape[0], bool)
    n = 0
    while True:
        post = normalize(logpost)
        cp = class_probs(post)
        if n >= min_items and cp.max() >= stop_p:
            return int(np.argmax(cp)), n
        if n >= max_items:
            k = int(np.argmax(cp))
            # benefit of the doubt: send someone away only with P(B1+) >= gate_p
            if k == 2 and cp[2] < gate_p:
                k = 1
            return k, n
        num_c = P * post[None, :]
        pc = num_c.sum(axis=1)
        cls_c = (num_c @ CLS_MASK) / pc[:, None]
        num_w = (1 - P) * post[None, :]
        pw = 1 - pc
        cls_w = (num_w @ CLS_MASK) / np.maximum(pw[:, None], 1e-12)
        eh = pc * entropy(cls_c) + pw * entropy(cls_w)
        eh[used] = np.inf
        j = int(np.argmin(eh))
        used[j] = True
        logpost = posterior_update(logpost, P[j], ex.answer(j))
        n += 1


def run_sprt3(ex, est, P, rng, delta=0.4, alpha=0.05, beta=0.05, max_items=25):
    A, B = math.log((1 - beta) / alpha), math.log(beta / (1 - alpha))
    llr = np.zeros(len(CUTS))
    logpost = prior_logpost()
    used = np.zeros(P.shape[0], bool)
    n = 0
    hi_P = [p4(cut + delta, est["a"], est["b"], est["c"], est["d"]) for cut in CUTS]
    lo_P = [p4(cut - delta, est["a"], est["b"], est["c"], est["d"]) for cut in CUTS]
    while True:
        dec = ["above" if v >= A else ("below" if v <= B else None) for v in llr]
        # consistent classification?
        if dec[0] == "below":
            return 0, n
        if dec[0] == "above" and dec[1] == "below":
            return 1, n
        if dec[1] == "above":
            return 2, n
        post = normalize(logpost)
        mean = float(post @ GRID)
        if n >= max_items:
            return cls_of(mean), n
        undecided = [k for k in range(len(CUTS)) if dec[k] is None]
        k = min(undecided, key=lambda kk: abs(CUTS[kk] - mean))
        info = fisher_info(CUTS[k], est["a"], est["b"], est["c"], est["d"])
        info[used] = -1
        j = int(np.argmax(info))
        used[j] = True
        ok = ex.answer(j)
        for kk in range(len(CUTS)):
            ph, pl = hi_P[kk][j], lo_P[kk][j]
            llr[kk] += math.log(ph / pl) if ok else math.log((1 - ph) / (1 - pl))
        logpost = posterior_update(logpost, P[j], ok)
        n += 1


# ---------------------------------------------------------------- experiment
def population(kind, rng, n):
    if kind == "uniform":
        return rng.uniform(-2.5, 3.5, n)
    comp = rng.choice(4, n, p=[0.15, 0.35, 0.35, 0.15])
    mu = np.array([-2.0, -0.75, 0.75, 2.3])[comp]
    sd = np.array([0.5, 0.45, 0.45, 0.6])[comp]
    return rng.normal(mu, sd)


def evaluate(method, thetas, bank, est, P, seed):
    rng = np.random.default_rng(seed)
    res = []
    for th in thetas:
        ex = Examinee(th, bank, rng)
        if method == "FIXED14":
            k, n = run_fixed14(ex, est, rng)
        elif method == "STAIR":
            k, n = run_stair(ex, est, rng)
        elif method == "STAIR-10":
            k, n = run_stair(ex, est, rng, block_n=10)
        elif method == "CAT-SE":
            k, n = run_cat_se(ex, est, P, rng)
        elif method == "SPRT3":
            k, n = run_sprt3(ex, est, P, rng)
        elif method == "BCCT":
            k, n = run_bcct(ex, est, P, rng)
        elif method == "BCCT+VOC":
            sd_pop, r = 1.6, 0.7
            sd_e = sd_pop * math.sqrt(1 / r**2 - 1)
            x = th + rng.normal(0, sd_e)
            prior = prior_logpost() - 0.5 * ((GRID - x) / sd_e) ** 2
            k, n = run_bcct(ex, est, P, rng, prior=prior)
        elif method == "BCCT-90":
            k, n = run_bcct(ex, est, P, rng, stop_p=0.90)
        else:
            raise ValueError(method)
        res.append((th, cls_of(th), k, n))
    return np.array(res)


def summarize(name, r):
    true, pred, n = r[:, 1].astype(int), r[:, 2].astype(int), r[:, 3]
    acc = (true == pred).mean()
    out = dict(method=name, acc=acc, mean_n=n.mean(), p90_n=np.percentile(n, 90))
    for k, lab in enumerate(["A1", "A2", "B1+"]):
        m = true == k
        out[f"acc_{lab}"] = (pred[m] == k).mean() if m.any() else float("nan")
    out["gate_sens"] = (pred[true == 2] == 2).mean()  # B1+ correctly gated
    out["false_gate_A2"] = (pred[true == 1] == 2).mean()  # A2 wrongly sent away
    near = np.abs(r[:, 0] - 1.5) < 0.3
    out["acc_near_gate"] = (true[near] == pred[near]).mean()
    dist = np.min(np.abs(r[:, 0][:, None] - CUTS[None, :]), axis=1)
    out["severe"] = ((true != pred) & (dist > 0.3)).mean()  # wrong although >0.3 logit away from any cut
    return out


def main():
    n_people = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    methods = ["FIXED14", "STAIR", "STAIR-10", "CAT-SE", "SPRT3", "BCCT", "BCCT-90", "BCCT+VOC"]
    for scenario in ["calibrated", "uncalibrated"]:
        for pop in ["pilot", "uniform"]:
            rng = np.random.default_rng(11)
            bank = make_bank(rng)
            est = assumed_params(bank, scenario, rng)
            P = make_P(est)
            thetas = population(pop, np.random.default_rng(5), n_people)
            print(f"\n### scenario={scenario} population={pop} n={n_people}")
            print(f"{'method':9} {'acc':>5} {'meanN':>6} {'p90N':>5} {'accA1':>6} {'accA2':>6} {'accB1+':>6} {'gate':>5} {'A2->gate':>8} {'nearGate':>8} {'severe':>6}")
            for i, m in enumerate(methods):
                s = summarize(m, evaluate(m, thetas, bank, est, P, seed=100 + i))
                print(f"{m:9} {s['acc']:5.3f} {s['mean_n']:6.1f} {s['p90_n']:5.0f} {s['acc_A1']:6.3f} {s['acc_A2']:6.3f} {s['acc_B1+']:6.3f} {s['gate_sens']:5.3f} {s['false_gate_A2']:8.3f} {s['acc_near_gate']:8.3f} {s['severe']:6.3f}")


if __name__ == "__main__":
    main()
