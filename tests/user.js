const anchor = require("@project-serum/anchor");
const { TOKEN_PROGRAM_ID, Token, AccountLayout } = require("@solana/spl-token");
const utils = require("./utils");

async function claimForUsers(users, vault) {
    let r = await Promise.all(
      users.map(a => a.claim(vault).then(b=>[a,b]))
    );
    console.log("--- users claimed ---")
    r.sort((a,b)=>a[0].id < b[0].id)
        .forEach(a=>{
            a[0].currentA = a[1][0];
            a[0].currentB = a[1][1];
            console.log(a[0].id, "amtA", a[0].currentA, "amtB", a[0].currentB);
        });
}

const getMetadata = async (mint) => {
    const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
        'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
    );
    return (
        await anchor.web3.PublicKey.findProgramAddress(
            [
                Buffer.from('metadata'),
                TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                mint.toBuffer(),
            ],
            TOKEN_METADATA_PROGRAM_ID,
        )
    )[0];
};

///user can be an admin or a staker. either way, call init - then can call other methods
class User {
    constructor(a) { this.id = a; }

    async init(initialLamports, lpTokenMint, initialLpToken, mintRewards, initialRewards) {
        this.keypair = new anchor.web3.Keypair();
        this.pubkey = this.keypair.publicKey;

        let envProvider = anchor.Provider.env();
        envProvider.commitment = 'pending';
        await utils.sendLamports(envProvider, this.pubkey, initialLamports);

        this.provider = new anchor.Provider(envProvider.connection, new anchor.Wallet(this.keypair), envProvider.opts);
        let program = anchor.workspace.NftStaking;
        this.program = new anchor.Program(program.idl, program.programId, this.provider);

        this.initialLamports = initialLamports;
        this.lpTokenMintObject = new Token(this.provider.connection, lpTokenMint, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialLpToken = initialLpToken;
        this.mintRewardsObject = new Token(this.provider.connection, mintRewards, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        this.initialRewards = initialRewards;
        
        this.poolPubkey = null;
        this.userPubkey = null;
        this.userNonce = null;
        this.lpPubkey = null;

        this.nft = null;
        this.nftMint = null;

        this.lpTokenPubkey = await this.lpTokenMintObject.createAssociatedTokenAccount(this.pubkey);
        if (initialLpToken > 0) {
            await this.lpTokenMintObject.mintTo(this.lpTokenPubkey, envProvider.wallet.payer, [], initialLpToken);
        }
        this.mintRewardsPubkey = await this.mintRewardsObject.createAssociatedTokenAccount(this.pubkey);
        if (initialRewards > 0) {
            await this.mintRewardsObject.mintTo(this.mintRewardsPubkey, envProvider.wallet.payer, [], initialRewards);
        }
    }

    async initializePool(poolKeypair) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        let poolNonce = _nonce;

        let lpTokenPoolVault = await this.lpTokenMintObject.createAccount(poolSigner);
        let mintRewardsVault = await this.mintRewardsObject.createAccount(poolSigner);

        const [
            _vaultPubkey,
            _vaultNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.provider.wallet.publicKey.toBuffer(), poolKeypair.publicKey.toBuffer()],
            this.program.programId
        );
        let vaultPubkey = _vaultPubkey;
        let vaultNonce = _vaultNonce;

        this.poolPubkey = poolKeypair.publicKey;
        this.admin = {
            poolKeypair,
            poolSigner,
            poolNonce,
            lpTokenPoolVault,
            mintRewardsVault,
            vaultPubkey,
            vaultNonce
        };

        await this.program.rpc.initializePool(
            poolNonce,
            vaultNonce,
            {
                accounts: {
                    authority: this.provider.wallet.publicKey,
                    lpTokenPoolVault: lpTokenPoolVault,
                    lpTokenDepositor: this.lpTokenPubkey,
                    lpTokenDepositAuthority: this.provider.wallet.publicKey,
                    rewardMint: this.mintRewardsObject.publicKey,
                    rewardVault: mintRewardsVault,
                    poolSigner: poolSigner,
                    pool: this.poolPubkey,
                    owner: this.provider.wallet.publicKey,
                    vault: vaultPubkey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
                signers: [poolKeypair],
                instructions: [
                    await this.program.account.pool.createInstruction(poolKeypair, ),
                ],
            }
        );

    }

    async createUserStakingAccount(poolPubkey) {
        this.poolPubkey = poolPubkey;

        const [
            _userPubkey, _userNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.provider.wallet.publicKey.toBuffer(), poolPubkey.toBuffer(), Buffer.from("user")],
            this.program.programId
        );
        this.userPubkey = _userPubkey;
        this.userNonce = _userNonce;

        const [
            userStorePubkey, userStoreNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.provider.wallet.publicKey.toBuffer(), poolPubkey.toBuffer(), Buffer.from("user"), [1]],
            this.program.programId
        );

        this.userStorePubkey = userStorePubkey;
        this.userStoreNonce = userStoreNonce;

        const balanceNeeded = await Token.getMinBalanceRentForExemptAccount(this.provider.connection);

        await this.program.rpc.createUser(this.userNonce, userStoreNonce, {
            accounts: {
                pool: poolPubkey,
                user: this.userPubkey,
                userStore: this.userStorePubkey,
                owner: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async createUserStoreAccount(poolPubkey) {
        this.poolPubkey = poolPubkey;

        const [
            userStorePubkey, userStoreNonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.provider.wallet.publicKey.toBuffer(), poolPubkey.toBuffer(), Buffer.from("user"), [2]],
            this.program.programId
        );

        this.userStorePubkey = userStorePubkey;
        this.userStoreNonce = userStoreNonce;

        await this.program.rpc.createUserStore(this.userStoreNonce, {
            accounts: {
                pool: poolPubkey,
                user: this.userPubkey,
                userStore: this.userStorePubkey,
                owner: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async stakeNFTToken(admin) {
        var toWallet = anchor.web3.Keypair.generate();

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        // var toTokenAccount = await this.nftMint.getOrCreateAssociatedAccountInfo(
        //   toWallet.publicKey,
        // );
        var toTokenAccount = await this.nftMint.createAccount(poolSigner)

        let metadata = await getMetadata(this.nftMint.publicKey);

        const [
            cmRewardPerToken,
            nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [
                this.poolPubkey.toBuffer(),
                Buffer.from('reward_per_token')
            ],
            this.program.programId
        );

        await this.program.rpc.stake({
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    vault: admin.vaultPubkey,
                    stakeToAccount: toTokenAccount,
                    lpTokenPoolVault: admin.lpTokenPoolVault,
                    lpTokenReceiver: this.lpTokenPubkey,
                    cmRewardPerToken,
                    // User.
                    user: this.userPubkey,
                    userStore: this.userStorePubkey,
                    owner: this.provider.wallet.publicKey,
                    stakeFromAccount: this.nft.address,
                    // Program signers.
                    poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    metadataInfo: metadata
                },
            }
        );
    }

    async pausePool(authority) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.pause(
            {
                accounts: {
                    lpTokenPoolVault: poolObject.lpTokenPoolVault,
                    lpTokenReceiver: this.lpTokenPubkey,
                    pool: this.poolPubkey,
                    authority: authority ?? this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async withdrawStake() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.withdrawStake(new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
            {
                accounts: {
                    lpTokenPoolVault: poolObject.lpTokenPoolVault,
                    lpTokenReceiver: this.lpTokenPubkey,
                    pool: this.poolPubkey,
                    owner: this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async withdrawRewards() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.withdrawReward(new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
            {
                accounts: {
                    rewardVault: poolObject.rewardVault,
                    rewardAccount: this.mintRewardsPubkey,
                    pool: this.poolPubkey,
                    owner: this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async depositStake() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.depositStake(new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
            {
                accounts: {
                    lpTokenPoolVault: poolObject.lpTokenPoolVault,
                    lpTokenDepositor: this.lpTokenPubkey,
                    lpTokenDepositAuthority: this.provider.wallet.publicKey,
                    pool: this.poolPubkey,
                    authority: this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async depositRewards() {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.depositReward(new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL),
            {
                accounts: {
                    rewardVault: poolObject.rewardVault,
                    rewardDepositor: this.mintRewardsPubkey,
                    rewardDepositAuthority: this.provider.wallet.publicKey,
                    pool: this.poolPubkey,
                    authority: this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async unpausePool(authority) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        let lpTokenPoolVault = await this.lpTokenMintObject.createAccount(poolSigner);
        this.admin.lpTokenPoolVault = lpTokenPoolVault;

        await this.program.rpc.unpause(
            {
                accounts: {
                    lpTokenPoolVault: lpTokenPoolVault,
                    lpTokenDepositor: this.lpTokenPubkey,
                    lpTokenDepositAuthority: this.provider.wallet.publicKey,
                    pool: this.poolPubkey,
                    authority: authority ?? this.provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
    }

    async unstakeNFTToken(admin) {
        let nftToken = new Token(this.provider.connection, this.nftMint.publicKey, TOKEN_PROGRAM_ID, this.provider.wallet.payer);
        const userNftAccount = await nftToken.getAccountInfo(this.nft.address);
        let mint = this.nft.mint;

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;
        const tokenAccounts = await this.provider.connection.getTokenAccountsByOwner(poolSigner, {
            mint: mint
        })
        console.log(tokenAccounts);
        const tokenAccount = tokenAccounts.value.find(t => t.amount > 0);
        if (!tokenAccount) {
            return;
        }

        const [
            cmRewardPerToken,
            nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [
                this.poolPubkey.toBuffer(),
                Buffer.from('reward_per_token')
            ],
            this.program.programId
        );

        await this.program.rpc.unstake(
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    vault: admin.vaultPubkey,
                    stakeToAccount: tokenAccount.pubkey,
                    lpTokenPoolVault: admin.lpTokenPoolVault,
                    lpTokenReceiver: this.lpTokenPubkey,
                    cmRewardPerToken,
                    // User.
                    user: this.userPubkey,
                    userStore: this.userStorePubkey,
                    owner: this.provider.wallet.publicKey,
                    stakeFromAccount: this.nft.address,
                    // Program signers.
                    poolSigner,
                    // Misc.
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            });
    }

    async pendingRewards() {
        let userObject = await this.program.account.user.fetch(this.pubkey);
        return userObject.rewardTokenPending.toNumber();
    }

    async claim(vault) {
        let poolObject = await this.program.account.pool.fetch(this.poolPubkey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        const [
            cmRewardPerToken,
            nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [
                this.poolPubkey.toBuffer(),
                Buffer.from('reward_per_token')
            ],
            this.program.programId
        );

        await this.program.rpc.claim({
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                vault,
                rewardVault: poolObject.rewardVault,
                // User.
                user: this.userPubkey,
                userStore: this.userStorePubkey,
                cmRewardPerToken,
                owner: this.provider.wallet.publicKey,
                rewardAccount: this.mintRewardsPubkey,
                // Program signers.
                poolSigner,
                // Misc.
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
        });

        let amt = await this.provider.connection.getTokenAccountBalance(this.mintRewardsPubkey);

        return [amt.value.uiAmount];
    }

    async setRewardPerToken(candyMachine, rewardPerToken) {
        await this.program.rpc.setRewardPerToken(rewardPerToken, {
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                authority: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async createCandyMachineRewardPerToken() {
        const [
            cmRewardPerToken,
            nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [
                this.poolPubkey.toBuffer(),
                Buffer.from('reward_per_token')
            ],
            this.program.programId
        );
        await this.program.rpc.createCandyMachineRewardPerToken(nonce, {
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                cmRewardPerToken: cmRewardPerToken,
                authority: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async setCandyMachineRewardPerToken(candyMachine, reward) {
        const [
            cmRewardPerToken,
            nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [
                this.poolPubkey.toBuffer(),
                Buffer.from('reward_per_token')
            ],
            this.program.programId
        );
        await this.program.rpc.setCandyMachineRewardPerToken(candyMachine, new anchor.BN(reward * anchor.web3.LAMPORTS_PER_SOL), {
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                cmRewardPerToken: cmRewardPerToken,
                authority: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async removeCandyMachineRewardPerToken(candyMachine) {
        const [
            cmRewardPerToken,
            nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [
                this.poolPubkey.toBuffer(),
                Buffer.from('reward_per_token')
            ],
            this.program.programId
        );
        await this.program.rpc.removeCandyMachineRewardPerToken(candyMachine, {
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                cmRewardPerToken: cmRewardPerToken,
                authority: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async addCandyMachine(candyMachine, rewardType, isVerify, vault) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.addCandyMachine(candyMachine, rewardType, isVerify, {
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                vault,
                authority: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async setVerifyCandyMachine(candyMachine, isVerify, vault) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.setVerifyCandyMachine(candyMachine, isVerify, {
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                vault,
                authority: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async removeCandyMachine(candyMachine, vault) {
        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [this.poolPubkey.toBuffer()],
            this.program.programId
        );
        let poolSigner = _poolSigner;

        await this.program.rpc.removeCandyMachine(candyMachine, {
            accounts: {
                // Stake instance.
                pool: this.poolPubkey,
                vault,
                authority: this.provider.wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });
    }

    async closeUser() {
        const user = await this.program.account.user.fetch(this.userPubkey);
        await this.program.rpc.closeUser(
            {
                accounts: {
                    // Stake instance.
                    pool: this.poolPubkey,
                    user: this.userPubkey,
                    owner: this.provider.wallet.publicKey,
                },
            });
    }

    async createNFT() {
        //create new token mint
        let mint = await Token.createMint(
          this.provider.connection,
          this.keypair,
          this.pubkey,
          null,
          9,
          TOKEN_PROGRAM_ID,
        );

        let nftAccount = await mint.getOrCreateAssociatedAccountInfo(
          this.pubkey,
        );

        await mint.mintTo(
          nftAccount.address,
          this.pubkey,
          [],
          1000000000,
        );

        await mint.setAuthority(
          mint.publicKey,
          null,
          "MintTokens",
          this.pubkey,
          []
        )

        this.nft = nftAccount;
        this.nftMint = mint;
    }
}

module.exports = {
    claimForUsers,
    User
};
