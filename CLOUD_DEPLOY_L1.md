# Hosting your Verdex L1 Blockchain RPC Node 24/7 in the Cloud

This guide outlines how to host your local RPC node on a persistent server so that it remains online and automatically validates blocks even when your computer is powered off.

---

## Deploying to Railway (Recommended - Fastest)

[Railway](https://railway.app) is the easiest platform for hosting Node.js background services. It automatically detects the `Dockerfile` inside the `/verdex-chain` directory.

### Step-by-Step Instructions:

1. **Create a GitHub Repository**:
   - Create a private or public repository on GitHub (e.g. `verdex-chain-node`).
   - Push the contents of the `verdex-chain/` folder to the root of this repository.

2. **Deploy on Railway**:
   - Sign up/log in at [https://railway.app](https://railway.app).
   - Click **New Project** → **Deploy from GitHub repo**.
   - Select your repository.
   - Click **Deploy Now**.

3. **Configure Network Ports**:
   - Railway will read the `EXPOSE 8545` instruction from the Dockerfile.
   - Go to the service settings in Railway and under **Variables**, add:
     - `PORT` = `8545`
   - Generate a domain by clicking **Generate Domain** in the settings tab. You will get a URL like `https://verdex-production.up.railway.app`.

4. **Update Website Dashboard Endpoint**:
   - Replace the local `http://127.0.0.1:8545` references with your Railway RPC URL.

---

## Deploying to Render (Free Tier Available)

[Render](https://render.com) allows hosting persistent Web Services directly from GitHub.

### Step-by-Step Instructions:

1. **Push your code to GitHub** (same as above).
2. **Log in to Render** and click **New** → **Web Service**.
3. **Connect your GitHub repository**.
4. Configure the Web Service settings:
   - **Name**: `verdex-blockchain-rpc`
   - **Environment**: `Docker`
   - **Branch**: `main`
5. Click **Advanced** and add the environment variables:
   - `PORT` = `8545`
6. Click **Deploy Web Service**. Render will build the Docker container and host it at a URL like `https://verdex-blockchain-rpc.onrender.com`.
