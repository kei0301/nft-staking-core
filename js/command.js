const anchor = require('@project-serum/anchor');
const serumCmn = require("@project-serum/common");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const fs = require('fs');

const path = require('path');
const os = require("os");

const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../target/idl/j_nft_staking.json')));
let programID = new anchor.web3.PublicKey("72DPSeKRFpnz6qaQByKkq3NnLYRw37His4QTJBoH4xDN");

const walletKeyData = JSON.parse(fs.readFileSync(os.homedir() + '/.config/solana/id.json'));
const walletKeypair = anchor.web3.Keypair.fromSecretKey(new Uint8Array(walletKeyData));
const wallet = new anchor.Wallet(walletKeypair);

let ANCHOR_PROVIDER_URL = 'https://ssc-dao.genesysgo.net';
let REWARD_TOKEN = 'WoSZYtctzp48xcdsSfGNKUGhjNdPx2qm5J2TUNfd1a1';
let poolPubkey = new anchor.web3.PublicKey('8H1XmfmzPSidYPEfc9Rcotr5PMdr9eqrX9tFiZZBBrK');

const argv = process.argv;
let values = [];
for (var i = 3; i < argv.length; i++) {
    if (argv[i].indexOf('--') == -1) {
        values.push(argv[i]);
    }
}

if (argv.indexOf('--env') > -1) {
    const env = argv[argv.indexOf('--env') + 1];
    if (env == 'devnet') {
        ANCHOR_PROVIDER_URL = 'https://api.devnet.solana.com';
        REWARD_TOKEN = 'EnMRdXxzohDn3PJCdvVJzBMD2FzSQegwVm87y44Pbai5';
        poolPubkey = new anchor.web3.PublicKey('8KtnTqsY7WguYhWKnzfRkz8NX68kEsaBvhWSjHFf6CJf');
        programID = new anchor.web3.PublicKey("72DPSeKRFpnz6qaQByKkq3NnLYRw37His4QTJBoH4xDN");
    } else if (env == 'localnet') {
        ANCHOR_PROVIDER_URL = 'http://localhost:8899';
        REWARD_TOKEN = 'BNg49dZHNtbT56D3bXK4zoLN3roNVYMtAgJEqDLzyNsc';
        poolPubkey = new anchor.web3.PublicKey('8H1XmfmzPSidYPEfc9Rcotr5PMdr9eqrX9tFiZZBBrK');
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
console.log(programID.toString(), ANCHOR_PROVIDER_URL)
const setRewardPerToken = async () => {
    if (!values[0]) {
        console.log('Missing some arguments.\n\nyarn set_reward_per_token <REWARD_AMOUNT>');
        return;
    }

    const rewardPerToken = new anchor.BN(values[0] * anchor.web3.LAMPORTS_PER_SOL);
    await program.rpc.setRewardPerToken(rewardPerToken, {
        accounts: {
            // Stake instance.
            pool: poolPubkey,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        },
    });
}

const addCandyMachine = async () => {
    if (!values[0] || !values[1]) {
        console.log('Missing some arguments.\n\nyarn add_candy_machine <CANDY_MACHINE_ID> <REWARD_TYPE>');
        return;
    }

    const candyMachine = new anchor.web3.PublicKey(values[0]);
    const rewardType = values[1];

    const [
        _vaultPubkey,
        _vaultNonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [provider.wallet.publicKey.toBuffer(), poolPubkey.toBuffer()],
        program.programId
    );
    let poolObject = await program.account.pool.fetch(poolPubkey);
    let vaultObject = await program.account.vault.fetch(_vaultPubkey);
    console.log(rewardType, candyMachine.toString(), poolPubkey.toString(), provider.wallet.publicKey.toString())
    console.log("Pool authority: ", poolObject.authority.toString())
    console.log("Pool paused: ", poolObject.paused)
    console.log("Candymachines: ", vaultObject.candyMachines)
    await program.rpc.addCandyMachine(candyMachine, rewardType, {
        accounts: {
            // Stake instance.
            pool: poolPubkey,
            vault: _vaultPubkey,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        },
    });
}

const removeCandyMachine = async () => {
    if (!values[0]) {
        console.log('Missing an arguments.\n\nyarn remove_candy_machine <CANDY_MACHINE_ID>');
        return;
    }

    const candyMachine = new anchor.web3.PublicKey(values[0]);

    const [
        _vaultPubkey,
        _vaultNonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [provider.wallet.publicKey.toBuffer(), poolPubkey.toBuffer()],
        program.programId
    );

    await program.rpc.removeCandyMachine(candyMachine, {
        accounts: {
            // Stake instance.
            pool: poolPubkey,
            vault: _vaultPubkey,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        },
    });
}

const withdrawRewardToken = async () => {
    if (!values[0]) {
        console.log('Missing an arguments.\n\nyarn withdraw_reward_token <AMOUNT>');
        return;
    }

    let amount = parseFloat(values[0]);
    if (isNaN(amount)) {
        console.log('Amount must be number');
        return;
    }
    let poolObject = await program.account.pool.fetch(poolPubkey);

    const [
        _poolSigner,
        _nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [poolPubkey.toBuffer()],
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
                pool: poolPubkey,
                owner: provider.wallet.publicKey,
                poolSigner: poolSigner,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
        }
    );
}

const depositRewardToken = async () => {
    if (!values[0]) {
        console.log('Missing an arguments.\n\nyarn deposit_reward_token <AMOUNT>');
        return;
    }

    let amount = parseFloat(values[0]);
    if (isNaN(amount)) {
        console.log('Amount must be number');
        return;
    }
    let poolObject = await program.account.pool.fetch(poolPubkey);

    const [
        _poolSigner,
        _nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [poolPubkey.toBuffer()],
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
                pool: poolPubkey,
                authority: provider.wallet.publicKey,
                poolSigner: poolSigner,
                tokenProgram: TOKEN_PROGRAM_ID,
            },
        }
    );
}

const createCandyMachineRewardPerToken = async () => {
    const [
        cmRewardPerToken,
        nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [
            poolPubkey.toBuffer(),
            Buffer.from('reward_per_token')
        ],
        program.programId
    );

    await program.rpc.createCandyMachineRewardPerToken(nonce, {
        accounts: {
            // Stake instance.
            pool: poolPubkey,
            cmRewardPerToken: cmRewardPerToken,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        },
    });
}

const setCandyMachineRewardPerToken = async () => {
    if (!values[0]) {
        console.log('Missing an arguments.\n\nyarn set_cm_reward_per_token <CANDY_MACHINE_ID> <REWARD_AMOUNT>');
        return;
    }

    if (!values[1]) {
        console.log('Missing an arguments.\n\nyarn set_cm_reward_per_token <CANDY_MACHINE_ID> <REWARD_AMOUNT>');
        return;
    }

    const candyMachine = new anchor.web3.PublicKey(values[0]);
    const reward = new anchor.BN(parseFloat(values[1]) * anchor.web3.LAMPORTS_PER_SOL);

    const [
        cmRewardPerToken,
        nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [
            poolPubkey.toBuffer(),
            Buffer.from('reward_per_token')
        ],
        program.programId
    );
    await program.rpc.setCandyMachineRewardPerToken(candyMachine, reward, {
        accounts: {
            // Stake instance.
            pool: poolPubkey,
            cmRewardPerToken: cmRewardPerToken,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        },
    });
}

const removeCandyMachineRewardPerToken = async () => {
    if (!values[0]) {
        console.log('Missing an arguments.\n\nyarn remove_cm_reward_per_token <CANDY_MACHINE_ID>');
        return;
    }

    const candyMachine = new anchor.web3.PublicKey(values[0]);

    const [
        cmRewardPerToken,
        nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [
            poolPubkey.toBuffer(),
            Buffer.from('reward_per_token')
        ],
        program.programId
    );
    await program.rpc.removeCandyMachineRewardPerToken(candyMachine, {
        accounts: {
            // Stake instance.
            pool: poolPubkey,
            cmRewardPerToken: cmRewardPerToken,
            authority: provider.wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        },
    });
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
                            argv.indexOf('--command_id=8') > -1 ? 8 :
                                argv.indexOf('--command_id=9') > -1 ? 9 :
                                    argv.indexOf('--command_id=10') > -1 ? 10 :
                                        argv.indexOf('--command_id=11') > -1 ? 11 : -1;
switch (commandID) {
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
        break;
    case 5:
        break;
    case 6:
        withdrawRewardToken();
        break;
    case 7:
        break;
    case 8:
        depositRewardToken();
        break;
    case 9:
        createCandyMachineRewardPerToken();
        break;
    case 10:
        setCandyMachineRewardPerToken();
        break;
    case 11:
        removeCandyMachineRewardPerToken();
        break;
    default:
        console.log('Unrecognized command');
        break;
}
