import os
import urllib.request
import urllib.error
import json
import base64

TOKEN = os.environ.get('GITHUB_TOKEN', '')
FORK_OWNER = 'verdexchainsuppourt-hue'
MAIN_REPO = 'verdexchainsuppourt-hue/verdex-ecosystem'
UPSTREAM = 'ethereum-lists/chains'
RPC_URL = 'https://rpc.verdexswap.site/rpc'
HEADERS = {
    'Authorization': f'token {TOKEN}',
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'VerdexChain/1.0'
}

def api(method, path, data=None):
    url = f'https://api.github.com{path}'
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, method=method, data=body)
    for k, v in HEADERS.items():
        req.add_header(k, v)
    try:
        res = urllib.request.urlopen(req)
        return json.loads(res.read().decode()), res.status
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        try:
            return json.loads(err), e.code
        except:
            return {}, e.code

def get_sha(repo, path, ref=None):
    query = f"?ref={ref}" if ref else ""
    data, status = api('GET', f'/repos/{repo}/contents/{path}{query}')
    return data.get('sha') if status == 200 else None

def update_file(repo, path, content, message, sha=None, branch=None):
    payload = {'message': message, 'content': base64.b64encode(content.encode()).decode()}
    if sha:
        payload['sha'] = sha
    if branch:
        payload['branch'] = branch
    data, status = api('PUT', f'/repos/{repo}/contents/{path}', payload)
    return status in [200, 201]

# 1. Update the Chainlist PR file in the fork
print('1. Updating Chainlist PR file in fork...')
CHAIN_JSON = {
    "name": "Verdex PRC20 Testnet",
    "chain": "VDX",
    "rpc": [RPC_URL],
    "faucets": ["https://verdexswap.site/faucet"],
    "nativeCurrency": {"name": "Verdex", "symbol": "VDX", "decimals": 18},
    "infoURL": "https://verdexswap.site",
    "shortName": "vdx",
    "chainId": 7201,
    "networkId": 7201,
    "slip44": 60,
    "explorers": [{"name": "Verdex Block Explorer", "url": "https://verdexswap.site/explorer", "standard": "EIP3091"}]
}
chain_content = json.dumps(CHAIN_JSON, indent=2)
sha = get_sha(f'{FORK_OWNER}/chains', '_data/chains/eip155-7201.json', 'add-verdex-prc20-testnet')
ok = update_file(f'{FORK_OWNER}/chains', '_data/chains/eip155-7201.json', chain_content,
                 f'Update RPC to {RPC_URL}', sha, 'add-verdex-prc20-testnet')
print(f'   Chainlist PR file: {"OK" if ok else "FAIL"}')

# 2. Update eip155-7201.json in main repo
print('2. Updating eip155-7201.json in main repo...')
sha = get_sha(MAIN_REPO, 'eip155-7201.json')
ok = update_file(MAIN_REPO, 'eip155-7201.json', chain_content, 'Update RPC URL to Railway', sha)
print(f'   eip155-7201.json: {"OK" if ok else "FAIL"}')

# 3. Update add-network.html
print('3. Updating add-network.html...')
with open('add-network.html', 'r', encoding='utf-8') as f:
    html_updated = f.read()
sha = get_sha(MAIN_REPO, 'add-network.html')
ok = update_file(MAIN_REPO, 'add-network.html', html_updated, 'Update RPC URL to Railway', sha)
print(f'   add-network.html: {"OK" if ok else "FAIL"}')

# 4. Update index.html MetaMask button
print('4. Updating index.html...')
with open('index.html', 'r', encoding='utf-8') as f:
    html_updated = f.read()
sha = get_sha(MAIN_REPO, 'index.html')
ok = update_file(MAIN_REPO, 'index.html', html_updated, 'Update RPC URL to Railway', sha)
print(f'   index.html: {"OK" if ok else "FAIL"}')

# 5. Update verdex-chain config.js
print('5. Updating verdex-chain/src/config.js...')
with open('verdex-chain/src/config.js', 'r', encoding='utf-8') as f:
    cfg_updated = f.read()
sha = get_sha(MAIN_REPO, 'verdex-chain/src/config.js')
ok = update_file(MAIN_REPO, 'verdex-chain/src/config.js', cfg_updated, 'Update RPC URL to Railway', sha)
print(f'   config.js: {"OK" if ok else "FAIL"}')

# 6. Upload railway.json
print('6. Uploading verdex-chain/railway.json...')
with open('verdex-chain/railway.json', 'r', encoding='utf-8') as f:
    rjson = f.read()
sha = get_sha(MAIN_REPO, 'verdex-chain/railway.json')
ok = update_file(MAIN_REPO, 'verdex-chain/railway.json', rjson, 'Add Railway config', sha)
print(f'   railway.json: {"OK" if ok else "FAIL"}')

print('\nALL DONE! RPC URL updated everywhere to:', RPC_URL)
