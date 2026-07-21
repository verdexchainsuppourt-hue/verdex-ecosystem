# Verdex edge update worker

This Cloudflare Worker serves only the two Android updater paths that are
compiled into the Verdex APK:

- `/updates/android/version.json`
- `/updates/android/remote-config.json`

Keep the worker route as `verdexswap.site/updates/android/*`. Do not add a
wallet, mining, token, KYC, P2P, or administration endpoint here. The free
Workers tier is reserved for small, public, stateless edge responses.
