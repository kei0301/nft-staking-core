const anchor = require('@project-serum/anchor');
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const fs = require('fs');

const path = require('path');
const os = require("os");

const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../target/idl/j_nft_staking.json')));
const programID = new anchor.web3.PublicKey('72DPSeKRFpnz6qaQByKkq3NnLYRw37His4QTJBoH4xDN');

const walletKeyData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../jid.json')));
const walletKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(walletKeyData));
const wallet = new anchor.Wallet(walletKeypair);

const connection = new anchor.web3.Connection(process.env.ANCHOR_PROVIDER_URL);

function getProvider() {
    const provider = new anchor.Provider(
        connection, wallet, { preflightCommitment: "processed" },
    );
    return provider;
};
const provider = getProvider();
let program = new anchor.Program(idl, programID, provider);
let mintRewards = new anchor.web3.PublicKey('WoSZYtctzp48xcdsSfGNKUGhjNdPx2qm5J2TUNfd1a1');
let poolKeypair, rewardsMintObject;

const initializeMints = async () => {
    console.log("Program ID: ", programID.toString());
    console.log("Wallet: ", provider.wallet.publicKey.toString());

    rewardsMintObject = new Token(provider.connection, mintRewards, TOKEN_PROGRAM_ID, provider.wallet.payer);

    const poolRawData = fs.readFileSync('json/pool.json');
    poolKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(poolRawData)));
}

const initializePool = async () => {
    await initializeMints();

    const [
        _poolSigner,
        _nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [poolKeypair.publicKey.toBuffer()],
        programID
    );
    let poolSigner = _poolSigner;
    let poolNonce = _nonce;
    console.log(poolSigner.toBase58())

    let mintRewardsVault;
    let accountInfos = await provider.connection.getParsedTokenAccountsByOwner(poolSigner, {
        mint: mintRewards
    });
    if (accountInfos.value.length > 0) {
        mintRewardsVault = accountInfos.value[0].pubkey;
    } else {
        mintRewardsVault = await rewardsMintObject.createAccount(poolSigner);
    }
    console.log("Rewards Vault: ", mintRewardsVault.toBase58());


    const [
        _vaultPubkey,
        _vaultNonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [provider.wallet.publicKey.toBuffer(), poolKeypair.publicKey.toBuffer()],
        programID
    );
    let vaultPubkey = _vaultPubkey;
    let vaultNonce = _vaultNonce;

    await program.rpc.initializePool(
        poolNonce,
        vaultNonce,
        {
            accounts: {
                authority: provider.wallet.publicKey,
                rewardMint: mintRewards,
                rewardVault: mintRewardsVault,
                poolSigner: poolSigner,
                pool: poolKeypair.publicKey,
                owner: provider.wallet.publicKey,
                vault: vaultPubkey,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
            signers: [poolKeypair],
            instructions: [
                await program.account.pool.createInstruction(poolKeypair,),
            ],
        }
    );
    console.log("Successfully initialized!");
}

initializePool();