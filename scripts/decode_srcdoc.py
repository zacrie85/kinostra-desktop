#!/usr/bin/env python3
"""Decode the agent-browser --json output into the raw srcdoc HTML file."""
import json

with open('/home/z/my-project/scripts/srcdoc_raw.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# agent-browser --json returns something like {"success": true, "data": {"result": "<html...>"}}
result = None
if isinstance(data, dict):
    if 'data' in data and isinstance(data['data'], dict):
        result = data['data'].get('result')
    elif 'result' in data:
        result = data['result']

if result is None:
    # maybe the file itself is the string
    result = data if isinstance(data, str) else json.dumps(data)

with open('/home/z/my-project/scripts/kinestra_original.html', 'w', encoding='utf-8') as f:
    f.write(result)

print('written:', len(result), 'chars')
