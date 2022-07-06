const anchor = require('@project-serum/anchor');
const serumCmn = require("@project-serum/common");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const fs = require('fs');

const path = require('path');
const os = require("os");

const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../target/idl/nft_staking.json')));
const programID = new anchor.web3.PublicKey(idl.metadata.address);

const walletKeyData = JSON.parse(fs.readFileSync(os.homedir() + '/.config/solana/id.json'));
const walletKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(walletKeyData));
const wallet = new anchor.Wallet(walletKeypair);

let ANCHOR_PROVIDER_URL = 'https://blue-delicate-wildflower.solana-mainnet.quiknode.pro/2f054b4c3a7d3f8841b584875204e3aa7c42d8ab/';
let STAKE_TOKEN = 'Gab5Qpgcppf3aLQCu6c34WSGiTEEMGdF3XQeuoDUijpK';
let REWARD_TOKEN = '2bL6yZANaMdW3KUbj8qUEkQPK77x5ScUCWxUgcLMxAm2';

const argv = process.argv;
let values = [];
for(var i = 3;i < argv.length; i ++) {
    if(argv[i].indexOf('--') == -1) {
        values.push(argv[i]);
    }
}

if(argv.indexOf('--env') > -1) {
    const env = argv[argv.indexOf('--env') + 1];
    if(env == 'devnet') {
        ANCHOR_PROVIDER_URL = 'https://api.devnet.solana.com';
    } else if(env == 'localnet') {
        ANCHOR_PROVIDER_URL = 'http://localhost:8899';
    }
}

const connection = new anchor.web3.Connection(ANCHOR_PROVIDER_URL);

function getProvider() {
  const provider = new anchor.Provider(
      connection, wallet, { preflightCommitment: "processed" },
  );
  return provider;
};
const provider = getProvider();
let program = new anchor.Program(idl, programID, provider);
const poolRawData = fs.readFileSync('json/pool.json');
let poolKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(poolRawData)));

const setRewardPerToken = async () => {
    if(!values[0] || !values[1]) {
        console.log('Missing some arguments.\n\nyarn set_reward_per_token <CANDY_MACHINE_ID> <REWARD_AMOUNT>');
        return;
    }

    const candyMachine = new anchor.web3.PublicKey(values[0]);
    const rewardPerToken = new anchor.BN(values[1] * anchor.web3.LAMPORTS_PER_SOL);
    await program.rpc.setRewardPerToken(rewardPerToken, {
        accounts: {
            // Stake instance.
            pool: poolKeypair.publicKey,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        },
    });
}

const setVerifyCandyMachine = async () => {
    if(!values[0] || !values[1]) {
        console.log('Missing some arguments.\n\nyarn set_verify_candy_machine <CANDY_MACHINE_ID> <IS_VERIFY>');
        return;
    }

    const candyMachine = new anchor.web3.PublicKey(values[0]);
    const isVerify = values[1];

    const [
        _vaultPubkey,
        _vaultNonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [provider.wallet.publicKey.toBuffer(), poolKeypair.publicKey.toBuffer()],
        program.programId
    );

    await program.rpc.setVerifyCandyMachine(candyMachine, isVerify, {
        accounts: {
            // Stake instance.
            pool: poolKeypair.publicKey,
            vault: _vaultPubkey,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        },
    });
}

const addCandyMachine = async () => {
    if(!values[0] || !values[1]) {
        console.log('Missing some arguments.\n\nyarn add_candy_machine <CANDY_MACHINE_ID> <REWARD_TYPE> [<IS_VERIFY>]');
        return;
    }

    const candyMachine = new anchor.web3.PublicKey(values[0]);
    const rewardType = values[1];
    const isVerify = values[2] || false;

    const [
        _vaultPubkey,
        _vaultNonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [provider.wallet.publicKey.toBuffer(), poolKeypair.publicKey.toBuffer()],
        program.programId
    );

    await program.rpc.addCandyMachine(candyMachine, rewardType, isVerify, {
        accounts: {
            // Stake instance.
            pool: poolKeypair.publicKey,
            vault: _vaultPubkey,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        },
    });
}

const removeCandyMachine = async () => {
    if(!values[0]) {
        console.log('Missing an arguments.\n\nyarn remove_candy_machine <CANDY_MACHINE_ID>');
        return;
    }

    const candyMachine = new anchor.web3.PublicKey(values[0]);

    const [
        _vaultPubkey,
        _vaultNonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [provider.wallet.publicKey.toBuffer(), poolKeypair.publicKey.toBuffer()],
        program.programId
    );

    await program.rpc.removeCandyMachine(candyMachine, {
        accounts: {
            // Stake instance.
            pool: poolKeypair.publicKey,
            vault: _vaultPubkey,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        },
    });
}

const withdrawStakeToken = async () => {
    if(!values[0]) {
        console.log('Missing an arguments.\n\nyarn withdraw_stake_token <AMOUNT>');
        return;
    }

    let amount = parseFloat(values[0]);
    if(isNaN(amount)) {
        console.log('Amount must be number');
        return;
    }

    let poolObject = await program.account.pool.fetch(poolKeypair.publicKey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            program.programId
        );
        let poolSigner = _poolSigner;

        var mintStakePublicKey = new anchor.web3.PublicKey(STAKE_TOKEN);
        var mintStakeObject = new Token(provider.connection, mintStakePublicKey, TOKEN_PROGRAM_ID, provider.wallet.payer);
        var mintStakeInfo = await mintStakeObject.getOrCreateAssociatedAccountInfo(provider.wallet.publicKey);
        await program.rpc.withdrawStake(new anchor.BN(amount * anchor.web3.LAMPORTS_PER_SOL),
            {
                accounts: {
                    lpTokenPoolVault: poolObject.lpTokenPoolVault,
                    lpTokenReceiver: mintStakeInfo.address,
                    pool: poolKeypair.publicKey,
                    owner: provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
}

const withdrawRewardToken = async () => {
    if(!values[0]) {
        console.log('Missing an arguments.\n\nyarn withdraw_reward_token <AMOUNT>');
        return;
    }

    let amount = parseFloat(values[0]);
    if(isNaN(amount)) {
        console.log('Amount must be number');
        return;
    }
    let poolObject = await program.account.pool.fetch(poolKeypair.publicKey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            program.programId
        );
        let poolSigner = _poolSigner;

        var mintRewardsPublicKey = new anchor.web3.PublicKey(REWARD_TOKEN);
        var mintRewardsObject = new Token(provider.connection, mintRewardsPublicKey, TOKEN_PROGRAM_ID, provider.wallet.payer);
        var mintRewardsInfo = await mintRewardsObject.getOrCreateAssociatedAccountInfo(provider.wallet.publicKey);
        await program.rpc.withdrawReward(new anchor.BN(amount * anchor.web3.LAMPORTS_PER_SOL),
            {
                accounts: {
                    rewardVault: poolObject.rewardVault,
                    rewardAccount: mintRewardsInfo.address,
                    pool: poolKeypair.publicKey,
                    owner: provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
}

const depositStakeToken = async () => {
    if(!values[0]) {
        console.log('Missing an arguments.\n\nyarn deposit_stake_token <AMOUNT>');
        return;
    }

    let amount = parseFloat(values[0]);
    if(isNaN(amount)) {
        console.log('Amount must be number');
        return;
    }
    let poolObject = await program.account.pool.fetch(poolKeypair.publicKey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            program.programId
        );
        let poolSigner = _poolSigner;

        var mintStakePublicKey = new anchor.web3.PublicKey(STAKE_TOKEN);
        var mintStakeObject = new Token(provider.connection, mintStakePublicKey, TOKEN_PROGRAM_ID, provider.wallet.payer);
        var mintStakeInfo = await mintStakeObject.getOrCreateAssociatedAccountInfo(provider.wallet.publicKey);
        await program.rpc.depositStake(new anchor.BN(amount * anchor.web3.LAMPORTS_PER_SOL),
            {
                accounts: {
                    lpTokenPoolVault: poolObject.lpTokenPoolVault,
                    lpTokenDepositor: mintStakeInfo.address,
                    lpTokenDepositAuthority: provider.wallet.publicKey,
                    pool: poolKeypair.publicKey,
                    authority   : provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
}

const depositRewardToken = async () => {
    if(!values[0]) {
        console.log('Missing an arguments.\n\nyarn deposit_reward_token <AMOUNT>');
        return;
    }

    let amount = parseFloat(values[0]);
    if(isNaN(amount)) {
        console.log('Amount must be number');
        return;
    }
    let poolObject = await program.account.pool.fetch(poolKeypair.publicKey);

        const [
            _poolSigner,
            _nonce,
        ] = await anchor.web3.PublicKey.findProgramAddress(
            [poolKeypair.publicKey.toBuffer()],
            program.programId
        );
        let poolSigner = _poolSigner;

        var mintRewardsPublicKey = new anchor.web3.PublicKey(REWARD_TOKEN);
        var mintRewardsObject = new Token(provider.connection, mintRewardsPublicKey, TOKEN_PROGRAM_ID, provider.wallet.payer);
        var mintRewardsInfo = await mintRewardsObject.getOrCreateAssociatedAccountInfo(provider.wallet.publicKey);
        await program.rpc.depositReward(new anchor.BN(amount * anchor.web3.LAMPORTS_PER_SOL),
            {
                accounts: {
                    rewardVault: poolObject.rewardVault,
                    rewardDepositor: mintRewardsInfo.address,
                    rewardDepositAuthority: provider.wallet.publicKey,
                    pool: poolKeypair.publicKey,
                    authority: provider.wallet.publicKey,
                    poolSigner: poolSigner,
                    tokenProgram: TOKEN_PROGRAM_ID,
                },
            }
        );
}

console.log("Program ID: ", programID.toString());
console.log("Wallet: ", provider.wallet.publicKey.toString());

const commandID = argv.indexOf('--command_id=1') > -1 ? 1 : 
                    argv.indexOf('--command_id=2') > -1 ? 2 : 
                    argv.indexOf('--command_id=3') > -1 ? 3 :
                    argv.indexOf('--command_id=4') > -1 ? 4 :
                    argv.indexOf('--command_id=5') > -1 ? 5 :
                    argv.indexOf('--command_id=6') > -1 ? 6 :
                    argv.indexOf('--command_id=7') > -1 ? 7 :
                    argv.indexOf('--command_id=8') > -1 ? 8 : -1;
switch(commandID) {
    case 1:
        setRewardPerToken();
        break;
    case 2:
        addCandyMachine();
        break;
    case 3:
        removeCandyMachine();
        break;
    case 4:
        setVerifyCandyMachine();
        break;
    case 5:
        withdrawStakeToken();
        break;
    case 6:
        withdrawRewardToken();
        break;
    case 7:
        depositStakeToken();
        break;
    case 8:
        depositRewardToken();
        break;
    default:
        console.log('Unrecognized command');
        break;
}