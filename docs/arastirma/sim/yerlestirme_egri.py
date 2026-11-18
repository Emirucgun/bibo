"""Accuracy vs. mean test length frontier for STAIR, SPRT3 and BCCT (pilot-like population).

Run from the repo root:  python3 docs/arastirma/sim/yerlestirme_egri.py [examinees]
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import yerlestirme as S  # noqa: E402

def run(method_fn, thetas, bank, seed):
    rng = np.random.default_rng(seed)
    out = []
    for th in thetas:
        ex = S.Examinee(th, bank, rng)
        k, n = method_fn(ex, rng)
        out.append((th, S.cls_of(th), k, n))
    return np.array(out)

def stats(r):
    t, p, n = r[:,1].astype(int), r[:,2].astype(int), r[:,3]
    return (t==p).mean(), n.mean(), (p[t==1]==2).mean(), (p[t==2]==2).mean()

N = int(sys.argv[1]) if len(sys.argv) > 1 else 1500
for scenario in ["calibrated", "uncalibrated"]:
    rng = np.random.default_rng(11)
    bank = S.make_bank(rng)
    est = S.assumed_params(bank, scenario, rng)
    P = S.make_P(est)
    th = S.population("pilot", np.random.default_rng(5), N)
    print(f"\n## {scenario} / pilot population, n={N}")
    print(f"{'config':26} {'acc':>5} {'meanN':>6} {'A2->gate':>8} {'gateSens':>8}")
    rows = []
    for blk in [4, 6, 8, 10, 14]:
        rows.append((f"STAIR block={blk}", lambda ex, r, blk=blk: S.run_stair(ex, est, r, block_n=blk)))
    for d, a in [(0.6, 0.1), (0.5, 0.05), (0.4, 0.05), (0.3, 0.05), (0.3, 0.025)]:
        rows.append((f"SPRT3 d={d} a={a}", lambda ex, r, d=d, a=a: S.run_sprt3(ex, est, P, r, delta=d, alpha=a, beta=a, max_items=30)))
    for sp in [0.80, 0.85, 0.90, 0.95, 0.98]:
        rows.append((f"BCCT stop={sp}", lambda ex, r, sp=sp: S.run_bcct(ex, est, P, r, stop_p=sp, max_items=30)))
    for i, (name, fn) in enumerate(rows):
        acc, mn, fg, gs = stats(run(fn, th, bank, 300 + i))
        print(f"{name:26} {acc:5.3f} {mn:6.1f} {fg:8.3f} {gs:8.3f}")
