# upload_releases.py - Upload Verdex binaries to GitHub Releases
# Uploads EXE installers and APK files that are git-ignored due to size.
# These are then served via GitHub CDN (no Vercel size limit).
# Usage:  python upload_releases.py  (run from project root)
import urllib.request
import urllib.error
import urllib.parse
import json
import os

TOKEN = os.environ.get('GITHUB_TOKEN', '')
REPO  = 'verdexchainsuppourt-hue/verdex-ecosystem'
TAG   = 'v4.0.2'
RELEASE_NAME = 'Verdex Miner v4.0.2'
RELEASE_BODY = (
    "## What's new in v4.0.2\n\n"
    "- Crystal logo & brand refresh\n"
    "- Enhanced auth: Google Sign-In + Email/Password\n"
    "- Live network stats on login screen\n"
    "- P2P network visualization in desktop app\n"
    "- Auto-update system (downloads from GitHub CDN)\n"
    "- Mining stability improvements & bug fixes\n\n"
    "### Downloads\n"
    "| Platform | File | Size |\n"
    "|----------|------|------|\n"
    "| Windows  | `Verdex-Miner-Setup-4.0.2.exe` | ~83 MB |\n"
    "| Android  | `Verdex-Android-1.9.2.apk`     | ~77 MB |\n"
)

FILES_TO_UPLOAD = [
    {
        'local': 'updates/Verdex-Miner-Setup-4.0.2.exe',
        'name':  'Verdex-Miner-Setup-4.0.2.exe',
        'label': 'Windows Installer v4.0.2',
        'mime':  'application/octet-stream',
    },
    {
        'local': 'updates/Verdex-Miner-Setup-4.0.2.exe.blockmap',
        'name':  'Verdex-Miner-Setup-4.0.2.exe.blockmap',
        'label': 'Windows Blockmap',
        'mime':  'application/octet-stream',
    },
    {
        'local': 'updates/latest.yml',
        'name':  'latest.yml',
        'label': 'electron-updater manifest',
        'mime':  'text/yaml',
    },
    {
        'local': 'assets/downloads/Verdex-Android-1.9.2.apk',
        'name':  'Verdex-Android-1.9.2.apk',
        'label': 'Android APK v1.9.2',
        'mime':  'application/vnd.android.package-archive',
    },
]

def gh_api(method, path, data=None):
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

def upload_asset(upload_url, filepath, name, mime, label):
    """Upload a file to a GitHub Release."""
    base_url = upload_url.split('{')[0]
    url = f'{base_url}?name={urllib.parse.quote(name)}&label={urllib.parse.quote(label)}'
    size = os.path.getsize(filepath)
    print(f'  Uploading {name} ({size / 1024 / 1024:.1f} MB)...')
    with open(filepath, 'rb') as f:
        data = f.read()
    req = urllib.request.Request(url, method='POST', data=data)
    req.add_header('Authorization', f'token {TOKEN}')
    req.add_header('Content-Type', mime)
    req.add_header('Content-Length', str(size))
    try:
        res = urllib.request.urlopen(req)
        j = json.loads(res.read().decode())
        dl_url = j.get('browser_download_url', '')
        print(f'  OK  {name}\n      -> {dl_url}')
        return dl_url
    except urllib.error.HTTPError as e:
        print(f'  FAIL {name} ({e.code}): {e.read().decode()[:300]}')
        return None

def main():
    print(f'\n Verdex Release Uploader  |  tag: {TAG}\n' + '='*55)

    # Check if release already exists
    data, status = gh_api('GET', f'/repos/{REPO}/releases/tags/{TAG}')
    if status == 200:
        release_id  = data['id']
        upload_url  = data['upload_url']
        print(f'Release {TAG} exists (id={release_id}). Reusing.')
    else:
        payload = {
            'tag_name':   TAG,
            'name':       RELEASE_NAME,
            'body':       RELEASE_BODY,
            'draft':      False,
            'prerelease': False,
        }
        data, status = gh_api('POST', f'/repos/{REPO}/releases', payload)
        if status not in [200, 201]:
            print(f'FAIL: create release {status} — {data}')
            return
        release_id = data['id']
        upload_url = data['upload_url']
        print(f'Created release id={release_id}')

    # Get existing assets to avoid re-uploads
    assets_data, _ = gh_api('GET', f'/repos/{REPO}/releases/{release_id}/assets')
    existing = {}
    if isinstance(assets_data, list):
        for a in assets_data:
            existing[a['name']] = a['browser_download_url']
    if existing:
        print(f'Already uploaded: {list(existing.keys())}')

    # Upload missing files
    cdn_urls = dict(existing)
    for f in FILES_TO_UPLOAD:
        local = f['local']
        name  = f['name']
        if not os.path.exists(local):
            print(f'  SKIP {name} — file not found at {local}')
            continue
        if name in existing:
            print(f'  SKIP {name} — already uploaded')
            continue
        url = upload_asset(upload_url, local, name, f['mime'], f['label'])
        if url:
            cdn_urls[name] = url

    # Patch version.json with CDN URLs
    exe_url = cdn_urls.get('Verdex-Miner-Setup-4.0.2.exe')
    apk_url = cdn_urls.get('Verdex-Android-1.9.2.apk')

    if exe_url:
        vj_path = 'updates/version.json'
        with open(vj_path, 'r') as vf:
            vj = json.load(vf)
        vj['downloads']['windows']['url'] = exe_url
        if apk_url:
            vj['downloads'].setdefault('android', {})
            vj['downloads']['android']['url'] = apk_url
            vj['downloads']['android']['fileName'] = 'Verdex-Android-1.9.2.apk'
        with open(vj_path, 'w') as vf:
            json.dump(vj, vf, indent=2)
        print(f'\n version.json patched with GitHub CDN URLs')

    print('\n CDN URLs:')
    for name, url in cdn_urls.items():
        print(f'  {name}:\n    {url}')
    print('\n Done! Now run:  python push_live.py  to push version.json to GitHub.')

if __name__ == '__main__':
    main()
