const assert = require("assert");
const anchor = require('@project-serum/anchor');
const serumCmn = require("@project-serum/common");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const utils = require("./utils");
const { User, claimForUsers } = require("./user");
const fs = require('fs');

let program = anchor.workspace.NftStaking;

//Read the provider from the configured environmnet.
//represents an outside actor
//owns mints out of any other actors control, provides initial $$ to others
const envProvider = anchor.Provider.env();

//we allow this convenience var to change between default env and mock user(s)
//initially we are the outside actor
let provider = envProvider;
//convenience method to set in anchor AND above convenience var
//setting in anchor allows the rpc and accounts namespaces access
//to a different wallet from env
function setProvider(p) {
  provider = p;
  anchor.setProvider(p);
  program = new anchor.Program(program.idl, program.programId, p);
};
setProvider(provider);

describe('Multiuser NFT Staking', () => {

  let lpMintKey;
  let lpMintObject;
  let lpMintPubkey;
  let users;
  let funder;
  let mintRewards;
  let poolKeypair = anchor.web3.Keypair.generate();

  const c1 = new anchor.web3.PublicKey('DdJ8bqWwWKxq2xmzNrrtmHgPMvSZf5XiQWsaQsDg8xaL');
  const c2 = new anchor.web3.PublicKey('5YYQqBJ1xhVoPsSG4YRBGz1pFTwYZmTiPipMH3NtZotm');
  const c3 = new anchor.web3.PublicKey('56pyAwcehMXvfrBmHeCGw6u9ZDD2SA96rAZxXWDEk3En');
  const c4 = new anchor.web3.PublicKey('CBicepikqk57L9dMypRSyWEuasM6VgaunUn2kgsHRw5c');

  it("Initialize mints", async () => {
    console.log("Program ID: ", program.programId.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());

    let lpMintKey = new anchor.web3.Keypair()
    lpMintPubkey = lpMintKey.publicKey;
    lpMintObject = await utils.createMintFromPriv(lpMintKey, provider, provider.wallet.publicKey, null, 9, TOKEN_PROGRAM_ID);
    setProvider(envProvider);
    //these mints are ecosystem mints not owned
    //by funder or user
    mintRewards = await utils.createMint(provider, 9);
  });

  it("Initialize users", async () => {
    users = [1].map(a => new User(a));
    await Promise.all(
      users.map(a => a.init(1_000_000_000, lpMintPubkey, 0, mintRewards.publicKey, 0))
    );
  })

  it("Initialize funder", async () => {
    funder = new User(99);
    await funder.init(1_000_000_000, lpMintPubkey, 100_000_000_000_000, mintRewards.publicKey, 100_000_000_000);
  });

  //to track cost to create pool, and compare to refund at teardown
  let costInLamports; 

  it("Creates a pool", async () => {
    //give just ONE more lp token
    lpMintObject.mintTo(funder.lpTokenPubkey, envProvider.wallet.payer, [], 1);

    await funder.initializePool(poolKeypair);
  });

  it("Create reward per token account", async () => {
    await funder.createCandyMachineRewardPerToken();
  })

  it("set reward per token account", async () => {
    await funder.setCandyMachineRewardPerToken(c1, 1);
  })

  it("remove reward per token account", async () => {
    await funder.removeCandyMachineRewardPerToken(c1);
  })

  it("Add candy machine", async () => {
    await funder.addCandyMachine(c1, 1, true, funder.admin.vaultPubkey);
    await funder.addCandyMachine(c2, 2, false, funder.admin.vaultPubkey);
  })

  it("Set verify candy machine", async () => {
    await funder.setVerifyCandyMachine(c1, false, funder.admin.vaultPubkey);
    await funder.setVerifyCandyMachine(c2, true, funder.admin.vaultPubkey);
  })

  it("create nft user 1", async () => {
    await users[0].createNFT();
  })

  it('User does staking', async () => {
    let pool = funder.poolPubkey;
    let user = users[0];
    await user.createUserStakingAccount(pool);
    await user.createUserStoreAccount(pool);
    await user.stakeNFTToken(funder.admin);

    const vaultObject = await program.account.vault.fetch(funder.admin.vaultPubkey);
    const nfts = vaultObject.nfts;
  });

  it('claim', async () => {
    let user = users[0];
    await claimForUsers([user], funder.admin.vaultPubkey);
  })

  it('unstaking', async () => {
    let user = users[0];
    await user.unstakeNFTToken(funder.admin);
  })

  it('claim', async () => {
    let user = users[0];
    await claimForUsers([user], funder.admin.vaultPubkey);
  })

  it("Remove candy machine", async () => {
    await funder.removeCandyMachine(c1, funder.admin.vaultPubkey);
    await funder.removeCandyMachine(c2, funder.admin.vaultPubkey);
  })

  it('deposit staking', async () => {
    await funder.depositStake();
  })

  it('withdraw staking', async () => {
    await funder.withdrawStake();
  })

  it('try withdraw staking by user', async () => {
    try {
      await users[0].withdrawStake();
    } catch(e) {
      console.log(e);
    }
  })

  it('deposit rewards', async () => {
    await funder.depositRewards();
  })

  it('withdraw rewards', async () => {
    await funder.withdrawRewards();
  })

  it('try withdraw rewards by user', async () => {
    try {
      await users[0].withdrawRewards();
    } catch(e) {
      console.log(e);
    }
  })

  it('close user', async () => {
    let user = users[0];
    await user.closeUser();
  })

  it('pausePool', async () => {
    await funder.pausePool(null);
  })
});  

async function getTokenBalance(pubkey) {
  return parseFloat((await provider.connection.getTokenAccountBalance(pubkey)).value.uiAmount.toFixed(6))
}

async function wait(seconds) {
  while(seconds > 0) {
    console.log("countdown " + seconds--);
    await new Promise(a=>setTimeout(a, 1000));
  }
  console.log("wait over");
}