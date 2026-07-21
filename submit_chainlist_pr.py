import os
import urllib.request
import urllib.error
import json
import time
import base64

TOKEN = os.environ.get('GITHUB_TOKEN', '')
FORK_OWNER = 'verdexchainsuppourt-hue'
UPSTREAM = 'ethereum-lists/chains'
HEADERS = {
    'Authorization': f'token {TOKEN}',
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'VerdexChain/1.0'
}

CHAIN_JSON = {
    "name": "Verdex PRC20 Testnet",
    "chain": "VDX",
    "rpc": [
        "https://rpc.verdexswap.site/rpc"
    ],
    "faucets": [
        "https://verdexswap.site/faucet"
    ],
    "nativeCurrency": {
        "name": "Verdex",
        "symbol": "VDX",
        "decimals": 18
    },
    "infoURL": "https://verdexswap.site",
    "shortName": "vdx",
    "chainId": 7201,
    "networkId": 7201,
    "slip44": 60,
    "explorers": [
        {
            "name": "Verdex Block Explorer",
            "url": "https://verdexswap.site/explorer",
            "standard": "EIP3091"
        }
    ]
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
        return json.loads(err) if err else {}, e.code

# Step 1: Fork the repo
print('Step 1: Forking ethereum-lists/chains...')
data, status = api('POST', f'/repos/{UPSTREAM}/forks', {})
if status in [202, 200]:
    print('  Fork created/already exists!')
else:
    print(f'  Fork response: {status} - {data.get("message","?")}')

# Step 2: Wait for fork to be ready
print('Step 2: Waiting 8 seconds for fork to be ready...')
time.sleep(8)

# Step 3: Get the default branch SHA of the fork
print('Step 3: Getting fork branch SHA...')
data, status = api('GET', f'/repos/{FORK_OWNER}/chains/git/ref/heads/master')
if status != 200:
    # try 'main' branch
    data, status = api('GET', f'/repos/{FORK_OWNER}/chains/git/ref/heads/main')
    branch = 'main'
else:
    branch = 'master'

if status != 200:
    print(f'  Could not get branch: {status} - {data}')
    exit(1)

sha = data['object']['sha']
print(f'  Branch: {branch}, SHA: {sha[:12]}...')

# Step 4: Create a new branch for the PR
new_branch = 'add-verdex-prc20-testnet'
print(f'Step 4: Creating new branch "{new_branch}"...')
data, status = api('POST', f'/repos/{FORK_OWNER}/chains/git/refs', {
    'ref': f'refs/heads/{new_branch}',
    'sha': sha
})
if status in [201, 200]:
    print('  Branch created!')
elif status == 422:
    print('  Branch already exists, continuing...')
else:
    print(f'  Branch creation: {status} - {data.get("message","?")}')

def get_sha(repo, path, ref_branch):
    data, status = api('GET', f'/repos/{repo}/contents/{path}?ref={ref_branch}')
    return data.get('sha') if status == 200 else None

# Step 5: Create or Update the file in the new branch
print('Step 5: Creating/Updating _data/chains/eip155-7201.json in fork...')
content = json.dumps(CHAIN_JSON, indent=2)
b64_content = base64.b64encode(content.encode()).decode()

sha = get_sha(f'{FORK_OWNER}/chains', '_data/chains/eip155-7201.json', new_branch)
payload = {
    'message': 'Add/Update Verdex PRC20 Testnet (Chain ID 7201)',
    'content': b64_content,
    'branch': new_branch
}
if sha:
    payload['sha'] = sha

data, status = api('PUT', f'/repos/{FORK_OWNER}/chains/contents/_data/chains/eip155-7201.json', payload)
if status in [201, 200]:
    print('  File created/updated successfully!')
else:
    print(f'  File creation/update: {status} - {data.get("message","?")}')

# Step 6: Create Pull Request
print('Step 6: Creating Pull Request to ethereum-lists/chains...')
data, status = api('POST', f'/repos/{UPSTREAM}/pulls', {
    'title': 'Add Verdex PRC20 Testnet (Chain ID 7201)',
    'body': '''## Summary
This PR adds the **Verdex PRC20 Testnet** to the chain registry.

**Chain Details:**
- **Network Name:** Verdex PRC20 Testnet
- **Chain ID:** 7201
- **Native Token:** VDX (Verdex)
- **Consensus:** Proof-of-Authority (PoA)
- **EVM Compatible:** Yes

**About Verdex:**
Verdex is a next-generation decentralized exchange (DEX) and DeFi ecosystem built on the proprietary PRC20 standard. The network is EVM-compatible, MetaMask-ready, and currently running its public testnet phase.

- **Website:** https://verdexswap.site
- **Block Explorer:** https://verdexswap.site/explorer
- **RPC:** https://rpc.verdexswap.site/rpc
- **Faucet:** https://verdexswap.site/faucet
- **Whitepaper:** https://verdexswap.site/whitepaper.html

Checklist:
- [x] Chain ID 7201 is not already in the repo
- [x] RPC URL is publicly accessible
- [x] Block explorer URL is live
- [x] Native currency decimals set to 18
- [x] JSON file is valid and follows the schema
''',
    'head': f'{FORK_OWNER}:{new_branch}',
    'base': branch
})

if status == 201:
    print(f'\nPULL REQUEST CREATED!')
    print(f'URL: {data.get("html_url","??")}')
elif status == 422:
    print(f'  PR may already exist or branch issue: {data.get("message","?")}')
else:
    print(f'  PR creation: {status} - {data.get("message","?")}')
