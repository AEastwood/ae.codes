import json, sys

aligned_path, out_path, duration = sys.argv[1], sys.argv[2], float(sys.argv[3])
data = json.load(open(aligned_path, encoding='utf-8'))
lines, timing = data['lines'], data['timing']

def stamp(t, bracket):
    m, s = divmod(max(0, t), 60)
    o, c = ('[', ']') if bracket == 'line' else ('<', '>')
    return f'{o}{int(m):02d}:{s:05.2f}{c}'

# Attach each lyric word's heard timing back onto its line
idx = 0
for l in lines:
    n = len(l['words'])
    l['heard'] = timing[idx:idx + n]
    idx += n

# Pass 1: settle every line's start from its first heard word (if plausible) so ends can use final starts
for li, l in enumerate(lines):
    first = l['heard'][0] if l['heard'] else None
    old_next = next((x['time'] for x in lines[li + 1:]), duration)
    l['start'] = first[0] if first and l['time'] - 2.0 <= first[0] <= old_next - 0.3 else l['time']
for prev, cur in zip(lines, lines[1:]):
    cur['start'] = max(cur['start'], prev['start'] + 0.3)

out = []
stats = {'heard': 0, 'interpolated': 0, 'moved_lines': 0}
for li, l in enumerate(lines):
    next_time = next((x['start'] for x in lines[li + 1:]), duration)
    if not l['words']:
        out.append(stamp(l['start'], 'line'))
        continue

    # Keep only heard times that sit plausibly inside this line
    window_lo, window_hi = l['start'], next_time - 0.15
    anchors = [h[0] if h and window_lo <= h[0] <= window_hi else None for h in l['heard']]
    # Enforce increasing order; drop anything that goes backwards
    last = -1
    for i, a in enumerate(anchors):
        if a is not None and a <= last:
            anchors[i] = None
        elif a is not None:
            last = a

    start = l['start']
    if start != l['time']:
        stats['moved_lines'] += 1
    anchors[0] = start

    # Line ends at the last heard word's end, or before the next line
    tail = [h[1] for h, a in zip(l['heard'], anchors) if h and a is not None]
    last_anchor = max(a for a in anchors if a is not None)
    end = min(next_time - 0.05, max(tail[-1] if tail else start, start + 0.4 * len(l['words'])))
    end = max(end, last_anchor + 0.1)

    # Fill gaps by spreading words between known anchors, weighted by word length
    weights = [len(w) + 1 for w in l['words']]
    points = [i for i, a in enumerate(anchors) if a is not None] + [len(anchors)]
    times = list(anchors)
    for p, q in zip(points, points[1:]):
        t0 = anchors[p]
        t1 = anchors[q] if q < len(anchors) else end
        total = sum(weights[p:q]) or 1
        acc = 0
        for i in range(p, q):
            if i != p:
                times[i] = t0 + (t1 - t0) * acc / total
                stats['interpolated'] += 1
            else:
                stats['heard'] += anchors[i] is not None
            acc += weights[i]

    parts = [stamp(times[0], 'line')]
    for t, w in zip(times, l['words']):
        parts.append(f'{stamp(t, "word")}{w} ')
    parts.append(stamp(end, 'word'))
    out.append(''.join(parts).replace(' <', ' <').rstrip())

open(out_path, 'w', encoding='utf-8', newline='\n').write('\n'.join(out) + '\n')
print(stats, 'lines', len(out))
