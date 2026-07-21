import os
import base64
import urllib.request
import urllib.error
import json
import sys

TOKEN = os.environ.get('GITHUB_TOKEN', '')
REPO = 'verdexchainsuppourt-hue/verdex-ecosystem'

def get_file_sha(repo_path):
    url = f'https://api.github.com/repos/{REPO}/contents/{repo_path}'
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'token {TOKEN}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    try:
        response = urllib.request.urlopen(req)
        return json.loads(response.read().decode())['sha']
    except:
        return None

def upload_file(path, repo_path):
    print(f'Uploading {path} to {repo_path}...', end='', flush=True)
    if not os.path.exists(path):
        print(' FILE NOT FOUND LOCAL')
        return
    with open(path, 'rb') as f:
        content = f.read()
    b64 = base64.b64encode(content).decode('utf-8')
    url = f'https://api.github.com/repos/{REPO}/contents/{repo_path}'
    payload = {'message': f'Sync {repo_path} to v4.0.2', 'content': b64}
    sha = get_file_sha(repo_path)
    if sha:
        payload['sha'] = sha
    req = urllib.request.Request(url, method='PUT')
    req.add_header('Authorization', f'token {TOKEN}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('Content-Type', 'application/json')
    try:
        urllib.request.urlopen(req, data=json.dumps(payload).encode())
        print(' OK')
    except urllib.error.HTTPError as e:
        print(f' FAIL -- {e.code} ({e.read().decode()})')

files_to_sync = [
    'updates/version.json',
    'updates/latest.yml',
    'verdex-desktop-app/package.json',
    'verdex-desktop-app/update.html',
    'verdex-desktop-app/ui/index.html',
    'verdex-desktop-app/auth.html',
    'verdex-desktop-app/main.js',
    'index.html',
    'dashboard.html',
    'css/style.css',
    'vercel.json'
]

for f in files_to_sync:
    upload_file(f, f)
