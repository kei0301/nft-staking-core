# NFT STAKING

### Program Id

`3YiBLWJFZt94mshvr8Kb6zvxfCu4D5rVZUyFpMVyEhJ4`

### Pool public key

`8H1XmfmzPSidYPEfc9Rcotr5PMdr9eqrX9tFiZZBBrK`

### Installation

#### Install Rust

`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

`source $HOME/.cargo/env`

`rustup component add rustfmt`

#### Install Solana

`sh -c "$(curl -sSfL https://release.solana.com/v1.9.1/install)"`

#### Install Yarn

`npm install -g yarn`

#### Install Anchor

For now, we can use Cargo to install the CLI.

`cargo install --git https://github.com/project-serum/anchor --tag v0.19.0 anchor-cli --locked`

On Linux systems you may need to install additional dependencies if cargo install fails. On Ubuntu,

`sudo apt-get update && sudo apt-get upgrade && sudo apt-get install -y pkg-config build-essential libudev-dev`

Now verify the CLI is installed properly.

`anchor --version`

### LP token ID

Go to line 11 in  `staking-core/programs/nft-staking/src/lib.rs`.

And replace `LP_TOKEN_MINT_PUBKEY` to yours.

And if you want more amount for lp token, you can change `LP_DEPOSIT_REQUIREMENT` amount. You can calculate reall amount by using this formula. `amount * lp token's decimals powers of 10`

### Build Project

First, need to go to project directory on command window. And run below commands.

#### Build

`anchor build`

#### Copy Program ID

`cp program-id.json target/deploy/nft_staking-keypair.json`

##### NOTE: If you want to change program id of yours, you can use below command.

`solana-keygen new --outfile program-id.json --force`

`cp program-id.json target/deploy/nft_staking-keypair.json`

`solana address -k program-id.json`

Copy output result of this command and paste it to line 9 in `staking-core/programs/nft-staking/src/lib.rs`.

`anchor build`

### Deployment

#### DEVNET

Open `Anchor.toml` file and change `cluster` of `[provider]` to `devnet` and save it. And check wallet path of `[provider] wallet`.

Your wallet have to contain some SOL on devnet. If you have not any SOL on devnet, you can request some SOL on devnet by running 

`solana airdrop 2 SOL your_wallet_address`

`anchor deploy`

#### MAINNET

Open `Anchor.toml` file and change `cluster` of `[provider]` to `mainnet` and save it. And check wallet path of `[provider] wallet`.

Your wallet have to contain some SOL on mainnet.

`anchor deploy`

### Initialize Pool

##### NOTE: Before initialize, you has to have `LP` token and `REWARD` token mint addresses. Also, update line 31, 32 in `js/init.js`.

`mkdir json`

`solana-keygen new --outfile json/pool.json`

#### DEVNET

`yarn run dev-init-pool`

#### MAINNET

`yarn run init-pool`

### Set Pool Reward Per Token

`yarn set_reward_per_token <REWARD_AMOUNT>`

#### NOTE: reward per token amount is 1 by default. If you want to run this command on devnet, you need to add `--env devnet`.

### Create/Update/Remove Candy Machine Reward Per Token

`yarn create_cm_reward_per_token`

`yarn set_cm_reward_per_token <CANDY_MACHINE_ID> <REWARD_AMOUNT>`

`yarn remove_cm_reward_per_token <CANDY_MACHINE_ID>`


#### NOTE: If you don't set reward per token for candy machine, the rewarod amount is pool reward per token by default. If you want to run this command on devnet, you need to add `--env devnet`.

### Add new candy machine id

`yarn add_candy_machine <CANDY_MACHINE_ID> <REWARD_TYPE> [<IS_VERIFY>]`

#### NOTE: `REWARD_TYPE` is integer. It is reward duration. If you want to run this command on devnet, you need to add `--env devnet`.

### Remove candy machine id

`yarn remove_candy_machine <CANDY_MACHINE_ID>`

#### NOTE: If you want to run this command on devnet, you need to add `--env devnet`.

### Withdraw stake token

`yarn withdraw_stake_token <AMOUNT>`

#### NOTE: Before run this command, pls update `js/command.js` line 18 to your stake token identify address.
#### NOTE: If you want to run this command on devnet, you need to add `--env devnet`.
#### NOTE: local wallet must become pool owner wallet.

### Withdraw reward token

`yarn withdraw_reward_token <AMOUNT>`

#### NOTE: Before run this command, pls update `js/command.js` line 19 to your stake token identify address.
#### NOTE: If you want to run this command on devnet, you need to add `--env devnet`.
#### NOTE: local wallet must become pool owner wallet.

### Deposit stake token

`yarn deposit_stake_token <AMOUNT>`

#### NOTE: Before run this command, pls update `js/command.js` line 18 to your stake token identify address.
#### NOTE: If you want to run this command on devnet, you need to add `--env devnet`.
#### NOTE: local wallet must become pool owner wallet.

### Deposit reward token

`yarn deposit_reward_token <AMOUNT>`

#### NOTE: Before run this command, pls update `js/command.js` line 19 to your stake token identify address.
#### NOTE: If you want to run this command on devnet, you need to add `--env devnet`.
#### NOTE: local wallet must become pool owner wallet.