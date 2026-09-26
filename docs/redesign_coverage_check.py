#!/usr/bin/env python3
"""Coverage check for REDESIGN_STATUS.md.

1. Every W1-W50, L1-L48, H1-H53 appears exactly once as a key in the section 6 tables.
2. Every phase listed for an item in section 6 mentions that item in its section 4 block.
3. Every item mentioned in a section 4 phase block lists that phase in section 6.
"""
import re
import sys

path = sys.argv[1]
text = open(path, encoding="utf-8").read()
lines = text.splitlines()

def section(start_pat, end_pat):
    s = next(i for i, l in enumerate(lines) if re.match(start_pat, l))
    e = next(i for i, l in enumerate(lines) if i > s and re.match(end_pat, l))
    return lines[s:e]

expected = [f"W{i}" for i in range(1, 51)] + [f"L{i}" for i in range(1, 49)] + [f"H{i}" for i in range(1, 54)]
ID = re.compile(r"^[WLH]\d+$")
PH = re.compile(r"P\d[ab]?")

assign = {}
dups = []
for l in section(r"^## 6\.", r"^### Deferred"):
    if not l.startswith("|"):
        continue
    cells = [c.strip() for c in l.strip().strip("|").split("|")]
    for k, v in zip(cells[0::2], cells[1::2]):
        if ID.match(k):
            if k in assign:
                dups.append(k)
            assign[k] = v

missing = [x for x in expected if x not in assign]
extra = [x for x in assign if x not in expected]

# Phase blocks in section 4.
blocks = {}
cur = None
for l in section(r"^## 4\.", r"^## 5\."):
    m = re.match(r"^### (P\d[ab]?):", l)
    if m:
        cur = m.group(1)
        blocks[cur] = []
    elif cur:
        blocks[cur].append(l)
mentions = {p: set(re.findall(r"\b([WLH]\d+)\b", "\n".join(b))) for p, b in blocks.items()}
mentions = {p: {x for x in s if x in expected} for p, s in mentions.items()}

problems = []
for item, v in assign.items():
    for p in PH.findall(v):
        if p not in blocks:
            problems.append(f"{item}: phase {p} has no section 4 block")
        elif item not in mentions[p]:
            problems.append(f"{item}: section 6 says {p}, but the {p} block never mentions it")
for p, s in mentions.items():
    for item in sorted(s):
        v = assign.get(item, "")
        if p not in PH.findall(v):
            problems.append(f"{item}: mentioned in {p} block, but section 6 says '{v}'")

counts = {"assigned": 0, "Deferred": 0, "N/A": 0}
for v in assign.values():
    if v.startswith("Deferred"):
        counts["Deferred"] += 1
    elif v.startswith("N/A"):
        counts["N/A"] += 1
    else:
        counts["assigned"] += 1

print(f"keys={len(assign)} expected={len(expected)} counts={counts}")
print(f"missing={missing}\nduplicates={dups}\nextra={extra}")
print(f"cross-reference problems ({len(problems)}):")
for p in problems:
    print("  " + p)
sys.exit(1 if (missing or dups or extra or problems) else 0)
