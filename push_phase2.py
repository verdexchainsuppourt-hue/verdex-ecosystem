import os
import urllib.request
import urllib.error
import json
import base64

TOKEN = os.environ.get('GITHUB_TOKEN', '')
REPO = 'verdexchainsuppourt-hue/verdex-ecosystem'

def api(method, path, data=None):
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

def get_sha(path):
    data, status = api('GET', f'/repos/{REPO}/contents/{path}')
    return data.get('sha') if status == 200 else None

def upload_file(local_path, repo_path):
    with open(local_path, 'r', encoding='utf-8') as f:
        content = f.read()
    sha = get_sha(repo_path)
    b64 = base64.b64encode(content.encode('utf-8')).decode('utf-8')
    payload = {'message': f'Add {repo_path} - security audit & legitimacy', 'content': b64}
    if sha:
        payload['sha'] = sha
    data, status = api('PUT', f'/repos/{REPO}/contents/{repo_path}', payload)
    if status in [200, 201]:
        print(f'OK: {repo_path}')
    else:
        print(f'FAIL: {repo_path} - {status}')

files = [
    ('SECURITY_REPORT.md', 'SECURITY_REPORT.md'),
    ('README.md', 'README.md'),
]

for local, remote in files:
    upload_file(local, remote)
