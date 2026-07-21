import os
import subprocess

env = os.environ.copy()
env['GIT_TERMINAL_PROMPT'] = '0'
env['GIT_ASKPASS'] = ''

result = subprocess.run(
    [r'C:\Users\kidst\scoop\shims\git.exe', 'push', '-u', 'origin', 'main'],
    env=env,
    capture_output=True,
    text=True
)

print(f"Return code: {result.returncode}")
print(f"STDOUT:\n{result.stdout}")
print(f"STDERR:\n{result.stderr}")
