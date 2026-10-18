import difflib, json, re, sys

lrc_path, words_path, out_path = sys.argv[1:4]
heard = json.load(open(words_path, encoding='utf-8'))

def norm(w):
    return re.sub(r"[^a-z0-9]", '', w.lower())

lines = []
for raw in open(lrc_path, encoding='utf-8').read().splitlines():
    m = re.match(r'\[(\d+):(\d+(?:\.\d+)?)\](.*)', raw.strip())
    if not m:
        continue
    text = m.group(3).strip()
    lines.append({'time': int(m.group(1)) * 60 + float(m.group(2)), 'text': text, 'words': text.split() if text else []})

# Flatten lyric words, keeping track of which line each came from
lyric_tokens = [(li, wi, norm(w)) for li, l in enumerate(lines) for wi, w in enumerate(l['words'])]
heard_tokens = [norm(h['word']) for h in heard]

matcher = difflib.SequenceMatcher(a=[t[2] for t in lyric_tokens], b=heard_tokens, autojunk=False)
timing = [None] * len(lyric_tokens)
for block in matcher.get_matching_blocks():
    for k in range(block.size):
        h = heard[block.b + k]
        timing[block.a + k] = [h['start'], h['end']]

matched = sum(t is not None for t in timing)
print('lyric words', len(lyric_tokens), 'matched', matched)

# Report per-line coverage and drift against the existing line timestamps (no lyric text printed)
idx = 0
for li, l in enumerate(lines):
    n = len(l['words'])
    t = timing[idx:idx + n]
    got = [x for x in t if x]
    first = got[0][0] if got else None
    print(li, 'old', l['time'], 'heard', first, 'drift', round(first - l['time'], 2) if first is not None else '-', f'{len(got)}/{n}')
    idx += n

json.dump({'lines': lines, 'timing': timing}, open(out_path, 'w', encoding='utf-8'))
