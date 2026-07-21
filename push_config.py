import urllib.request
import urllib.error
import json
import base64
import os

TOKEN = os.environ.get('GITHUB_TOKEN', '')
REPO = 'verdexchainsuppourt-hue/verdex-ecosystem'
FILE_PATH = 'verdex-chain/src/config.js'

def api(method, path, data=None):
    if not TOKEN:
        raise RuntimeError('Set GITHUB_TOKEN in the environment before running this deployment helper.')
    url = f'https://api.github.com{path}'
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, method=method, data=body)
    req.add_header('Authorization', f'token {TOKEN}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('Content-Type', 'application/json')
    try:
        res = urllib.request.urlopen(req)
        return json.loads(res.read().decode()), res.status
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        try:
            return json.loads(err), e.code
        except:
            return {}, e.code

def get_sha(repo, path):
    data, status = api('GET', f'/repos/{repo}/contents/{path}')
    return data.get('sha') if status == 200 else None

print('Uploading config.js...')
with open(FILE_PATH, 'r', encoding='utf-8') as f:
    content = f.read()

sha = get_sha(REPO, FILE_PATH)
b64_content = base64.b64encode(content.encode()).decode()

payload = {
    'message': 'Fix Railway PORT crash',
    'content': b64_content
}
if sha:
    payload['sha'] = sha

data, status = api('PUT', f'/repos/{REPO}/contents/{FILE_PATH}', payload)
if status in [200, 201]:
    print('✅ config.js pushed to GitHub successfully!')
else:
    print(f'❌ Failed to push config.js: {status} - {data}')
