import os
import base64
import urllib.request
import urllib.error
import json

TOKEN = os.environ.get('GITHUB_TOKEN', '')
REPO = 'verdexchainsuppourt-hue/verdex-ecosystem'

def upload_file(path, repo_path):
    with open(path, 'rb') as f:
        content = f.read()
    b64_content = base64.b64encode(content).decode('utf-8')
    url = f'https://api.github.com/repos/{REPO}/contents/{repo_path}'
    req = urllib.request.Request(url, method='PUT')
    req.add_header('Authorization', f'token {TOKEN}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('Content-Type', 'application/json')
    data = json.dumps({'message': f'Add {repo_path}', 'content': b64_content}).encode('utf-8')
    try:
        response = urllib.request.urlopen(req, data=data)
        print(f'Successfully uploaded {repo_path}')
    except urllib.error.HTTPError as e:
        print(f'Failed to upload {repo_path}: {e.code} {e.read().decode()}')

upload_file('README.md', 'README.md')
