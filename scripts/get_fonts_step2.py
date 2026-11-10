#!/usr/bin/env python3
"""Parse Google Fonts CSS, keep latin + latin-ext blocks, download woff2 files locally,
and emit fonts.css pointing to local files."""
import re, os, subprocess, hashlib

RAW = '/tmp/fonts_raw.css'
OUT_CSS = '/home/z/my-project/kinostra-desktop/renderer/fonts/fonts.css'
DATA = '/home/z/my-project/kinostra-desktop/renderer/fonts/data'
os.makedirs(DATA, exist_ok=True)

css = open(RAW, 'r', encoding='utf-8').read()

# Split into comment-labeled sections: /* latin */ @font-face {...}
pattern = re.compile(r'/\*\s*([a-z0-9-]+)\s*\*/\s*(@font-face\s*\{[^}]+\})', re.S)
blocks = pattern.findall(css)
print(f'found {len(blocks)} font-face blocks')

keep_subsets = {'latin', 'latin-ext'}
out_parts = []
download_jobs = []

for subset, block in blocks:
    if subset not in keep_subsets:
        continue
    # extract family, weight, url
    fam = re.search(r"font-family:\s*'([^']+)'", block)
    wgt = re.search(r'font-weight:\s*(\d+)', block)
    sty = re.search(r'font-style:\s*(\w+)', block)
    url = re.search(r'url\((https://[^)]+\.woff2)\)', block)
    urange = re.search(r'unicode-range:\s*([^;]+);', block)
    if not (fam and wgt and url):
        continue
    fam_n = fam.group(1).replace(' ', '')
    wgt_n = wgt.group(1)
    sty_n = sty.group(1) if sty else 'normal'
    fname = f'{fam_n}-{wgt_n}{"" if sty_n=="normal" else "-"+sty_n}-{subset}.woff2'
    download_jobs.append((url.group(1), os.path.join(DATA, fname)))
    nb = block
    nb = re.sub(r'src:\s*url\([^)]+\)\s*format\([^)]+\);',
                f"src: url('data/{fname}') format('woff2');", nb)
    if urange:
        nb = nb.replace(urange.group(0), f"unicode-range: {urange.group(1)};")
    out_parts.append(f'/* {fam.group(1)} {wgt_n} {sty_n} {subset} */\n' + nb)

print(f'keeping {len(out_parts)} blocks, downloading {len(download_jobs)} files')

ok = 0
for url, dest in download_jobs:
    if os.path.exists(dest) and os.path.getsize(dest) > 500:
        ok += 1
        continue
    r = subprocess.run(['curl', '-sL', '--retry', '3', '-o', dest, url], capture_output=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 500:
        ok += 1
    else:
        print('FAILED:', url)

print(f'downloaded OK: {ok}/{len(download_jobs)}')

with open(OUT_CSS, 'w', encoding='utf-8') as f:
    f.write('/* KINOSTRA local fonts - 100% offline */\n' + '\n'.join(out_parts))

print('fonts.css written:', os.path.getsize(OUT_CSS), 'bytes')
total = sum(os.path.getsize(os.path.join(DATA, f)) for f in os.listdir(DATA))
print(f'total font data: {total/1024:.0f} KB in {len(os.listdir(DATA))} files')
