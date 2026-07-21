# push_all_changes.py - Push all modified files to GitHub (triggers Vercel redeploy)
# Files changed: index.html, dashboard.html, updates/version.json, verdex-desktop-app/ui/index.html, verdex-desktop-app/main.js
import urllib.request
import urllib.error
import json
import base64
import os

TOKEN = os.environ.get('GITHUB_TOKEN', '')
REPO  = 'verdexchainsuppourt-hue/verdex-ecosystem'

FILES = [
    # Website files (deployed by Vercel)
    'index.html',
    'dashboard.html',
    'updates/version.json',
    'updates/latest.yml',
    # Desktop app source (for reference / future rebuilds)
    'verdex-desktop-app/main.js',
    'verdex-desktop-app/ui/index.html',
    'verdex-desktop-app/update.html',
    'verdex-desktop-app/package.json',
    'upload_releases.py',
]

def api(method, path, data=None):
    url = f'https://api.github.com{path}'
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, method=method, data=body)
    req.add_header('Authorization', f'token {TOKEN}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    if data:
        req.add_header('Content-Type', 'application/json')
    try:
        res = urllib.request.urlopen(req)
        return json.loads(res.read().decode()), res.status
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        try:
            return json.loads(err), e.code
        except:
            return {'raw': err}, e.code

def get_sha(repo_path):
    data, status = api('GET', f'/repos/{REPO}/contents/{repo_path}')
    return data.get('sha') if status == 200 else None

def push_file(local_path, repo_path, commit_msg=None):
    if not os.path.exists(local_path):
        print(f'  SKIP {repo_path} — not found locally')
        return False
    try:
        with open(local_path, 'rb') as f:
            raw = f.read()
        b64 = base64.b64encode(raw).decode('utf-8')
        sha = get_sha(repo_path)
        payload = {
            'message': commit_msg or f'Update {repo_path}',
            'content': b64
        }
        if sha:
            payload['sha'] = sha
        data, status = api('PUT', f'/repos/{REPO}/contents/{repo_path}', payload)
        if status in [200, 201]:
            print(f'  OK   {repo_path}')
            return True
        else:
            print(f'  FAIL {repo_path} — {status}: {str(data)[:120]}')
            return False
    except Exception as e:
        print(f'  ERR  {repo_path} — {e}')
        return False

print('\n Verdex Push — Deploying all changes\n' + '='*50)
print('Repo:', REPO)
print()

ok = 0
fail = 0
for f in FILES:
    result = push_file(f, f, 'fix: APK v1.9.2 links, update URL fix (GitHub CDN), P2P network engine')
    if result: ok += 1
    else: fail += 1

print(f'\n Done: {ok} OK, {fail} failed')
print('Vercel will auto-redeploy in ~60 seconds.')
print()
if ok > 0:
    print('Changes deployed:')
    print('  index.html        -> APK v1.9.2 download link')
    print('  dashboard.html    -> APK v1.9.2 download link')
    print('  updates/version.json -> EXE download URL -> GitHub CDN (fixes "too small")')
    print('  verdex-desktop-app/ui/index.html -> P2P Network tab rebuilt')
    print('  verdex-desktop-app/main.js -> GitHub CDN fallback for updates')
