import os
import base64
import urllib.request
import urllib.error
import json

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
    with open(path, 'rb') as f:
        content = f.read()
    b64 = base64.b64encode(content).decode('utf-8')
    url = f'https://api.github.com/repos/{REPO}/contents/{repo_path}'
    payload = {'message': f'Update {repo_path}', 'content': b64}
    sha = get_file_sha(repo_path)
    if sha:
        payload['sha'] = sha
    req = urllib.request.Request(url, method='PUT')
    req.add_header('Authorization', f'token {TOKEN}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('Content-Type', 'application/json')
    try:
        urllib.request.urlopen(req, data=json.dumps(payload).encode())
        print(f'OK: {repo_path}')
    except urllib.error.HTTPError as e:
        print(f'FAIL: {repo_path} -- {e.code}')

for f in ['index.html', 'add-network.html', 'eip155-7201.json']:
    if os.path.exists(f):
        upload_file(f, f)
