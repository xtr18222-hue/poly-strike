"""Mirror of the map geometry -> flood-fill connectivity check (pure python)."""

BLOCKERS = []   # (cx, cy, half_x, half_y)

def wall_x(x, y0, y1, gaps, t=0.3):
    cur = y0
    for g0, g1 in sorted(gaps):
        if g0 > cur:
            BLOCKERS.append((x, (cur + g0) / 2, t, (g0 - cur) / 2))
        cur = max(cur, g1)
    if cur < y1:
        BLOCKERS.append((x, (cur + y1) / 2, t, (y1 - cur) / 2))

def wall_y(y, x0, x1, gaps, t=0.3):
    cur = x0
    for g0, g1 in sorted(gaps):
        if g0 > cur:
            BLOCKERS.append(((cur + g0) / 2, y, (g0 - cur) / 2, t))
        cur = max(cur, g1)
    if cur < x1:
        BLOCKERS.append(((cur + x1) / 2, y, (x1 - cur) / 2, t))

# outer boundary
wall_y(0, -20, 20, [])
wall_y(28, -20, 20, [])
wall_x(-20, 0, 28, [])
wall_x(20, 0, 28, [])
# lane dividers with doorways
DG = [(2, 4.4), (11, 13.4), (23, 25.4)]
wall_x(-8, 0, 28, DG)
wall_x(8, 0, 28, DG)
wall_y(18, -20, -8, [(-16, -13.6)])
wall_y(18, 8, 20, [(13.6, 16)])
wall_y(20, -8, 8, [(-1.2, 1.2)])

CRATES = [
    (2, 9), (-2, 13), (2, 16.5), (-2.5, 11),
    (-17, 4), (-11, 9), (-15, 14),
    (17, 4), (11, 9), (15, 14),
    (13, 21), (17.5, 26), (15.5, 23.5),
    (-13, 21), (-17.5, 26), (-15.5, 23.5),
    (-5.5, 1.5), (5.5, 1.5), (-5.5, 25.5), (5.5, 25.5),
]
for cx, cy in CRATES:
    BLOCKERS.append((cx, cy, 0.8, 0.8))

STEP = 0.5
X0, X1, Y0, Y1 = -19.5, 19.5, 0.5, 27.5
W = int((X1 - X0) / STEP) + 1
H = int((Y1 - Y0) / STEP) + 1

def idx(x, y):
    return (int((x - X0) / STEP), int((y - Y0) / STEP))

def blocked(x, y, margin=0.35):
    for bx, by, hx, hy in BLOCKERS:
        if (abs(x - bx) - hx) < margin and (abs(y - by) - hy) < margin:
            return True
    return False

SEEDS = {
    'T_spawn':    (0, 3),
    'CT_spawn':   (0, 24),
    'mid':        (0, 14),
    'siteA':      (14, 23),
    'siteB':      (-14, 23),
    'longA_mid':  (14, 9),
    'shortB_mid': (-14, 9),
}

def flood(sx, sy):
    seen = [[False] * H for _ in range(W)]
    stack = [idx(sx, sy)]
    count = 0
    while stack:
        gx, gy = stack.pop()
        if not (0 <= gx < W and 0 <= gy < H) or seen[gx][gy]:
            continue
        x, y = X0 + gx * STEP, Y0 + gy * STEP
        if blocked(x, y):
            continue
        seen[gx][gy] = True
        count += 1
        stack.extend([(gx + 1, gy), (gx - 1, gy), (gx, gy + 1), (gx, gy - 1)])
    return seen, count

seen, cells = flood(*SEEDS['T_spawn'])
print('reachable cells from T spawn:', cells, '(of %d total)' % (W * H))

bad = []
for name, (sx, sy) in SEEDS.items():
    gx, gy = idx(sx, sy)
    ok = seen[gx][gy] if (0 <= gx < W and 0 <= gy < H) else False
    print(('  REACHABLE    ' if ok else '  UNREACHABLE  ') + name, (sx, sy))
    if not ok:
        bad.append(name)

print('CONNECTIVITY:', 'FAIL ' + str(bad) if bad else 'PASS (all zones reachable from T spawn)')

# sanity: every seed cell itself must be free (not inside a wall)
for name, (sx, sy) in SEEDS.items():
    if blocked(sx, sy):
        print('  WARNING: seed', name, 'is inside a blocker')
