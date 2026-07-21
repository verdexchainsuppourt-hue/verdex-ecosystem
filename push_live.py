import os
import subprocess
import sys

env = os.environ.copy()
env['GIT_TERMINAL_PROMPT'] = '0'
env['GIT_ASKPASS'] = ''

print("Starting live git push...")
sys.stdout.flush()

process = subprocess.Popen(
    [
        r'C:\Users\kidst\scoop\apps\git\current\cmd\git.exe',
        '-c', 'filter.lfs.required=false',
        '-c', 'filter.lfs.smudge=cat',
        '-c', 'filter.lfs.clean=cat',
        '-c', 'credential.helper=',
        'push', '-f', 'origin', 'main', '--progress'
    ],
    env=env,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1
)

# Read stderr live (git push outputs progress to stderr)
while True:
    line = process.stderr.readline()
    if not line:
        break
    print(line.strip())
    sys.stdout.flush()

process.wait()
print(f"Git push finished with exit code {process.returncode}")
