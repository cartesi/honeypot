# Honeypot Deployment on Fly.io

This repository provides sample `fly.toml` files for deploying a Honeypot validator node to [Fly.io](https://fly.io).  
It contains two preconfigured examples for deployment to **Ethereum Mainnet** and **Sepolia testnet**.

> **Note:** The `fly.toml` files rely on the Dockerfile located at `../compose/Dockerfile`.  
> Ensure you place or run these configs from the correct directory.

## 🛠️ Requirements

Before proceeding, ensure you have the following:

- A valid **Fly.io account** ([sign up](https://fly.io/docs/hands-on/sign-up/))
- An **RPC URL** for the target network:
  - ⚠️ *Free Alchemy plans* may hit a 500-block range limit, causing sync issues.
  - ✅ Prefer [Infura](https://infura.io) (even free tier supports limited usage) or upgrade to a paid RPC provider.
- A **private key** funded with ETH for transaction fees on your selected network (Mainnet or Sepolia).

## 🚀 Deployment Steps

### 1. Install the Fly.io CLI

Choose the installation method for your OS:

- macOS (Homebrew):
  
```bash
brew install flyctl  
```

- Linux (Curl):
  
```bash
curl -L https://fly.io/install.sh | sh 
```

- Windows (PowerShell):
  
```bash
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex" 
```

### 2. Authenticate with Fly.io

Authenticate your CLI using the below command:

```shell
fly auth login
```

### 3. Launch your node

CD into the `contrib/deploy` folder then, launch your node to a network of your choice by calling any of the below commands, then follow the launch steps by accepting to copy configurations to new app and responding with a "yes", and finally responding with a "no" if necessary to the question, "do you want to tweak settings before proceeding".

- Mainnet:
  
```shell
fly launch --config mainnet.fly.toml --no-deploy 
```

- Sepolia:

```shell
fly launch --config sepolia.fly.toml --no-deploy 
```

At the end of the process a new app is created for you on your fly.io dashboard.

### 4. Set Environment Secrets

Next we setup the necessary environmental variables using the below command:

- Mainnet:
  
```shell
fly secrets set --config mainnet.fly.toml WEB3_RPC_URL=<SEPOLIA OR MAINNET RPC OF CHOICE>
fly secrets set --config mainnet.fly.toml WEB3_PRIVATE_KEY=<PRIVATE_KEY>
```

- Sepolia:
  
```shell
fly secrets set --config sepolia.fly.toml WEB3_RPC_URL=<SEPOLIA OR MAINNET RPC OF CHOICE>
fly secrets set --config sepolia.fly.toml WEB3_PRIVATE_KEY=<PRIVATE_KEY>
```

> **Note:** Ensure to replace  `<SEPOLIA OR MAINNET RPC OF CHOICE>` should be the RPC URL for the network of your choice and finally `<PRIVATE_KEY>` should be a private key containing gas fees for your node.

### 5. Deploy the Node

Deploy your node using the command:

- Mainnet:
  
```shell
fly deploy --config mainnet.fly.toml 
```

- Sepolia:
  
```shell
fly deploy --config sepolia.fly.toml 
```
