use anchor_lang::prelude::*;
use anchor_lang::solana_program::{clock, program_option::COption};
use anchor_spl::token::{self, TokenAccount, Token, Mint};
use std::convert::Into;
use std::convert::TryInto;
use metaplex_token_metadata::state::{Metadata};

declare_id!("72DPSeKRFpnz6qaQByKkq3NnLYRw37His4QTJBoH4xDN");

pub fn update_rewards(
    pool: &mut Account<Pool>,
    u: &mut Box<Account<User>>,
    user_store: &mut Box<Account<UserStore>>,
    vault: &mut Box<Account<Vault>>,
    cm_reward_per_tokens: &mut Box<Account<CandyMachineRewardPerToken>>,
) -> Result<()> {
    let clock = clock::Clock::get().unwrap();

    let current_time: u64 = clock.unix_timestamp.try_into().unwrap();
    let mut reward_token_pending: u64 = 0;
    for i in 0..user_store.types.len() {
        let nft_type = user_store.types[i];
        let index = vault.reward_types.iter().position(|&x| x == nft_type);
        let mut reward_per_token = pool.reward_per_token;
        if index != None {
            let candy_machine = vault.candy_machines[index.unwrap()];
            let index = cm_reward_per_tokens.candy_machines.iter().position(|&x| x == candy_machine);
            if index != None {
                reward_per_token = cm_reward_per_tokens.reward_per_tokens[index.unwrap()]
            }
        }
    
        let staked_time = user_store.staked_times[i];
        let diff_times: u64 = current_time.checked_sub(staked_time).unwrap();
        user_store.staked_times[i] = current_time;
        reward_token_pending = reward_token_pending.checked_add(
                                    reward_per_token.checked_div(60 * 60 * 24).unwrap()
                                                    .checked_mul(diff_times).unwrap()
                                ).unwrap()
    }

    user_store.reward_token_pending = user_store.reward_token_pending.checked_add(reward_token_pending).unwrap();
    u.last_update_time = current_time;
    
    Ok(())
}

#[program]
pub mod j_nft_staking {
    use super::*;

    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        pool_nonce: u8,
        vault_nonce: u8,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        pool.authority = ctx.accounts.authority.key();
        pool.nonce = pool_nonce;
        pool.paused = false;
        pool.reward_mint = ctx.accounts.reward_mint.key();
        pool.reward_vault = ctx.accounts.reward_vault.key();
        pool.reward_per_token = 1_1000_000_000;
        pool.user_stake_count = 0;
        pool.balance_staked = 0;

        let vault = &mut ctx.accounts.vault;
        vault.nonce = vault_nonce;
        vault.candy_machines = vec![];
        vault.reward_types = vec![];
        
        Ok(())
    }

    pub fn set_reward_per_token(ctx: Context<SetRewardPerToken>, reward_per_token: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.reward_per_token = reward_per_token;

        Ok(())
    }

    pub fn create_candy_machine_reward_per_token(ctx: Context<CreateCandyMachineRewardPerToken>, nonce: u8) -> Result<()> {
        let cm_reward_per_token = &mut ctx.accounts.cm_reward_per_token;
        cm_reward_per_token.nonce = nonce;
        cm_reward_per_token.candy_machines = vec![];
        cm_reward_per_token.reward_per_tokens = vec![];

        Ok(())
    }

    pub fn set_candy_machine_reward_per_token(ctx: Context<SetCandyMachineRewardPerToken>, candy_machine: Pubkey, reward_per_token: u64) -> Result<()> {
        let cm_reward_per_token = &mut ctx.accounts.cm_reward_per_token;
        let index = cm_reward_per_token.candy_machines.iter().position(|&x| x == candy_machine);
        if index == None {
            cm_reward_per_token.candy_machines.push(candy_machine);
            cm_reward_per_token.reward_per_tokens.push(reward_per_token);
        } else {
            cm_reward_per_token.reward_per_tokens[index.unwrap()] = reward_per_token;
        }

        Ok(())
    }

    pub fn remove_candy_machine_reward_per_token(ctx: Context<SetCandyMachineRewardPerToken>, candy_machine: Pubkey) -> Result<()> {
        let cm_reward_per_token = &mut ctx.accounts.cm_reward_per_token;
        let index = cm_reward_per_token.candy_machines.iter().position(|&x| x == candy_machine);
        if index != None {
            cm_reward_per_token.candy_machines.remove(index.unwrap());
            cm_reward_per_token.reward_per_tokens.remove(index.unwrap());
        }

        Ok(())
    }

    pub fn create_user(ctx: Context<CreateUser>, nonce: u8, store_nonce: u8) -> Result<()> {
        let user = &mut ctx.accounts.user;
        user.pool = *ctx.accounts.pool.to_account_info().key;
        user.owner = *ctx.accounts.owner.key;
        user.balance_staked = 0;
        user.stores = 1;

        let current_time = clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap();

        user.last_update_time = current_time;
        user.nonce = nonce;

        let user_store = &mut ctx.accounts.user_store;
        user_store.nft_mints = vec![];
        user_store.types = vec![];
        user_store.staked_times = vec![];
        user_store.owner = *ctx.accounts.owner.key;
        user_store.nonce = store_nonce;
        user_store.store_id = user.stores;
        user_store.reward_token_pending = 0;


        let pool = &mut ctx.accounts.pool;
        pool.user_stake_count = pool.user_stake_count.checked_add(1).unwrap();

        Ok(())
    }

    pub fn create_user_store(ctx: Context<CreateUserStore>, nonce: u8) -> Result<()> {
        let user = &mut ctx.accounts.user;
        user.stores = user.stores.checked_add(1).unwrap();

        let user_store = &mut ctx.accounts.user_store;
        user_store.nft_mints = vec![];
        user_store.types = vec![];
        user_store.staked_times = vec![];
        user_store.owner = *ctx.accounts.owner.key;
        user_store.nonce = nonce;
        user_store.store_id = user.stores;
        user_store.reward_token_pending = 0;

        Ok(())
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.paused = true;

        Ok(())
    }

    pub fn unpause(ctx: Context<Unpause>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.paused = false;

        Ok(())
    }

    pub fn add_candy_machine(
                                ctx: Context<ManageCandyMachine>, 
                                candy_machine: Pubkey, 
                                reward_type: u8,
                            ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let index = vault.candy_machines.iter().position(|&x| x == candy_machine);
        if index == None {
            vault.candy_machines.push(candy_machine);
            vault.reward_types.push(reward_type);
        } else {
            vault.reward_types[index.unwrap()] = reward_type;
        }
        Ok(())
    }

    pub fn remove_candy_machine(ctx: Context<ManageCandyMachine>, 
                                candy_machine: Pubkey, ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let index = vault.candy_machines.iter().position(|&x| x == candy_machine);
        if index != None {
            vault.candy_machines.remove(index.unwrap());
            vault.reward_types.remove(index.unwrap());
        }
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        if pool.paused {
            return Err(ErrorCode::PoolPaused.into());
        }
        msg!("staking start");
        let metadata = Metadata::from_account_info(&ctx.accounts.metadata_info.to_account_info())?;
        let mut candy_flag = false;
        let mut reward_type = 0;
        msg!("Checking create");
        if let Some(cre) = metadata.data.creators {
            for c in cre {
                for i in 0..ctx.accounts.vault.candy_machines.len() {
                    let candy_machine = ctx.accounts.vault.candy_machines[i];
                    if c.address == candy_machine {
                        candy_flag = true;
                        reward_type = ctx.accounts.vault.reward_types[i];
                        break;
                    }
                }

                if candy_flag {
                    break;
                }
            }
        }
        if candy_flag != true {
            return Err(ErrorCode::CandyNotMatch.into());
        }
        msg!("Passed check candy machine");
        let user = &mut ctx.accounts.user;
        let user_store = &mut ctx.accounts.user_store;
        update_rewards(
            pool,
            user,
            user_store,
            &mut ctx.accounts.vault,
            &mut ctx.accounts.cm_reward_per_token,
        )
        .unwrap();
        msg!("updated rewards");
        user.balance_staked = user.balance_staked.checked_add(1 as u64).unwrap();
        pool.balance_staked = pool.balance_staked.checked_add(1 as u64).unwrap();
        msg!("Start nft transfer");
        // Transfer tokens into the stake vault.
        {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.stake_from_account.to_account_info(),
                    to: ctx.accounts.stake_to_account.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(), //todo use user account as signer
                },
            );
            token::transfer(cpi_ctx, 1 as u64)?;
            msg!("End nft transfer");
            
            user_store.nft_mints.push(ctx.accounts.stake_to_account.mint);
            user_store.types.push(reward_type);

            let current_time = clock::Clock::get().unwrap().unix_timestamp.try_into().unwrap();
            user_store.staked_times.push(current_time);
        }

        Ok(())
    }

    pub fn unstake(ctx: Context<Stake>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let user = &mut ctx.accounts.user;
        let vault = &mut ctx.accounts.vault;
        let user_store = &mut ctx.accounts.user_store;
    
        let metadata = Metadata::from_account_info(&ctx.accounts.metadata_info.to_account_info())?;
        let mut candy_flag = false;

        if let Some(cre) = metadata.data.creators {
            for c in cre {
                for i in 0..vault.candy_machines.len() {
                    let candy_machine = vault.candy_machines[i];
                    if c.address == candy_machine {
                        candy_flag = true;
                        break;
                    }
                }

                if candy_flag {
                    break;
                }
            }
        }
        if candy_flag != true {
            return Err(ErrorCode::CandyNotMatch.into());
        }

        update_rewards(
            pool,
            user,
            user_store,
            vault,
            &mut ctx.accounts.cm_reward_per_token,
        )
        .unwrap();
        user.balance_staked = user.balance_staked.checked_sub(1 as u64).unwrap();
        pool.balance_staked = pool.balance_staked.checked_sub(1 as u64).unwrap();

        // Transfer tokens from the pool vault to user vault.
        {
            let seeds = &[
                pool.to_account_info().key.as_ref(),
                &[pool.nonce],
            ];
            let pool_signer = &[&seeds[..]];

            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.stake_to_account.to_account_info(),
                    to: ctx.accounts.stake_from_account.to_account_info(),
                    authority: ctx.accounts.pool_signer.to_account_info(),
                },
                pool_signer,
            );
            token::transfer(cpi_ctx, 1 as u64)?;

            let stake_to_account_mint = ctx.accounts.stake_to_account.mint;

            let index = user_store.nft_mints.iter().position(|x| *x == stake_to_account_mint).unwrap();
            user_store.nft_mints.remove(index);
            user_store.types.remove(index);
            user_store.staked_times.remove(index);
        }

        Ok(())
    }

    pub fn claim(ctx: Context<ClaimReward>) -> Result<()> {
        let user = &mut ctx.accounts.user;
        let user_store = &mut ctx.accounts.user_store;
        update_rewards(
            &mut ctx.accounts.pool,
            user,
            user_store,
            &mut ctx.accounts.vault,
            &mut ctx.accounts.cm_reward_per_token,
        )
        .unwrap();

        let seeds = &[
            ctx.accounts.pool.to_account_info().key.as_ref(),
            &[ctx.accounts.pool.nonce],
        ];
        let pool_signer = &[&seeds[..]];

        if user_store.reward_token_pending > 0 {
            let mut reward_amount = user_store.reward_token_pending;
            let vault_balance = ctx.accounts.reward_vault.amount;

            user_store.reward_token_pending = 0;
            if vault_balance < reward_amount {
                reward_amount = vault_balance;
            }

            if reward_amount > 0 {
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token::Transfer {
                        from: ctx.accounts.reward_vault.to_account_info(),
                        to: ctx.accounts.reward_account.to_account_info(),
                        authority: ctx.accounts.pool_signer.to_account_info(),
                    },
                    pool_signer,
                );
                token::transfer(cpi_ctx, reward_amount)?;
            }
        }

        Ok(())
    }

    pub fn close_user(ctx: Context<CloseUser>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.user_stake_count = pool.user_stake_count.checked_sub(1).unwrap();
        Ok(())
    }

    pub fn close_n_account(ctx: Context<CloseNAccount>) -> Result<()> {
        let pool = &ctx.accounts.pool;
        let seeds = &[
            pool.to_account_info().key.as_ref(),
            &[pool.nonce],
        ];
        let pool_signer = &[&seeds[..]];
        anchor_spl::token::close_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::CloseAccount{
                    account: ctx.accounts.close_account.to_account_info(),
                    destination: ctx.accounts.owner.to_account_info(),
                    authority: ctx.accounts.pool_signer.to_account_info(),
                },
                pool_signer
        ))?;

        Ok(())
    }

    pub fn withdraw_reward(ctx: Context<WithdrawReward>, amount: u64) -> Result<()> {

        let seeds = &[
            ctx.accounts.pool.to_account_info().key.as_ref(),
            &[ctx.accounts.pool.nonce],
        ];
        let pool_signer = &[&seeds[..]];

        let mut withdraw_amount = amount;
        let vault_balance = ctx.accounts.reward_vault.amount;

        if vault_balance < withdraw_amount {
            withdraw_amount = vault_balance;
        }

        if withdraw_amount > 0 {
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.reward_vault.to_account_info(),
                    to: ctx.accounts.reward_account.to_account_info(),
                    authority: ctx.accounts.pool_signer.to_account_info(),
                },
                pool_signer,
            );
            token::transfer(cpi_ctx, withdraw_amount)?;
        }

        Ok(())
    }

    pub fn deposit_reward(ctx: Context<DepositReward>, amount: u64) -> Result<()> {
        let depositor_balance = ctx.accounts.reward_depositor.amount;
        let mut deposit_amount = amount;
        if amount > depositor_balance {
            deposit_amount = depositor_balance;
        }
        //lp lockup
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.reward_depositor.to_account_info(),
                to: ctx.accounts.reward_vault.to_account_info(),
                authority: ctx.accounts.reward_deposit_authority.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, deposit_amount)?;
        
        Ok(())
    }

}

#[derive(Accounts)]
#[instruction(pool_nonce: u8, vault_nonce: u8)]
pub struct InitializePool<'info> {
    /// CHECK: This is pool authority account
    authority: UncheckedAccount<'info>,
    reward_mint: Box<Account<'info, Mint>>,
    #[account(
        constraint = reward_vault.mint == reward_mint.key(),
        constraint = reward_vault.owner == pool_signer.key(),
        constraint = reward_vault.close_authority == COption::None,
    )]
    reward_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool_nonce,
    )]
    /// CHECK: This is pool signer with seeds
    pool_signer: UncheckedAccount<'info>,

    #[account(
        zero,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        init,
        payer = owner,
        seeds = [
            owner.key.as_ref(), 
            pool.to_account_info().key.as_ref()
        ],
        bump,
        space = 10240,
    )]
    vault: Box<Account<'info, Vault>>,
    #[account(mut)]
    owner: Signer<'info>,
    
    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetRewardPerToken<'info> {
    // Stake instance.
    #[account(
        mut,
        has_one = authority,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    authority: Signer<'info>,
    // Misc.
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
pub struct CreateCandyMachineRewardPerToken<'info> {
    // Stake instance.
    #[account(
        has_one = authority,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        init,
        payer = authority,
        seeds = [
            pool.to_account_info().key.as_ref(),
            "reward_per_token".as_bytes(),
        ],
        bump,
        space = 10240,
    )]
    cm_reward_per_token: Box<Account<'info, CandyMachineRewardPerToken>>,
    #[account(mut)]
    authority: Signer<'info>,
    // Misc.
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetCandyMachineRewardPerToken<'info> {
    #[account(
        has_one = authority,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        seeds = [
            pool.to_account_info().key.as_ref(),
            "reward_per_token".as_bytes(),
        ],
        bump = cm_reward_per_token.nonce,
    )]
    cm_reward_per_token: Box<Account<'info, CandyMachineRewardPerToken>>,
    authority: Signer<'info>,
    // Misc.
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u8, store_nonce: u8)]
pub struct CreateUser<'info> {
    // Stake instance.
    #[account(
        mut,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    // Member.
    #[account(
        init,
        payer = owner,
        seeds = [
            owner.key.as_ref(), 
            pool.to_account_info().key.as_ref(),
            "user".as_bytes()
        ],
        bump,
    )]
    user: Box<Account<'info, User>>,
    #[account(
        init,
        payer = owner,
        seeds = [
            owner.key.as_ref(), 
            pool.to_account_info().key.as_ref(),
            "user".as_bytes(),
            &[1]
        ],
        bump,
        space = 10240
    )]
    user_store: Box<Account<'info, UserStore>>,
    #[account(mut)]
    owner: Signer<'info>,
    // Misc.
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u8)]
pub struct CreateUserStore<'info> {
    // Stake instance.
    #[account(
        mut,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    // Member.
    #[account(
        seeds = [
            owner.key.as_ref(), 
            pool.to_account_info().key.as_ref(),
            "user".as_bytes(),
        ],
        bump = user.nonce,
    )]
    user: Box<Account<'info, User>>,
    #[account(
        init,
        payer = owner,
        seeds = [
            owner.key.as_ref(), 
            pool.to_account_info().key.as_ref(),
            "user".as_bytes(),
            &[user.stores + 1]
        ],
        bump,
        space = 10240
    )]
    user_store: Box<Account<'info, UserStore>>,
    #[account(mut)]
    owner: Signer<'info>,
    // Misc.
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(
        mut, 
        has_one = authority,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    authority: Signer<'info>,

    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is pool signer with seeds
    pool_signer: UncheckedAccount<'info>,
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Unpause<'info> {
    #[account(
        mut, 
        has_one = authority,
        constraint = pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    authority: Signer<'info>,

    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is pool signer with seeds
    pool_signer: UncheckedAccount<'info>,
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DepositReward<'info> {
    #[account(
        mut,
        constraint = reward_vault.owner == pool_signer.key(),
    )]
    reward_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
    )]
    reward_depositor: Box<Account<'info, TokenAccount>>,
    reward_deposit_authority: Signer<'info>,

    #[account(
        mut, 
        has_one = authority,
    )]
    pool: Box<Account<'info, Pool>>,
    authority: Signer<'info>,

    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is pool signer with seeds
    pool_signer: UncheckedAccount<'info>,
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
    )]
    vault: Box<Account<'info, Vault>>,
    #[account(
        mut,
        constraint = stake_to_account.owner == *pool_signer.key,
    )]
    stake_to_account: Box<Account<'info, TokenAccount>>,

    // User.
    #[account(
        mut, 
        has_one = owner, 
        has_one = pool,
        seeds = [
            owner.key.as_ref(), 
            pool.to_account_info().key.as_ref(),
            "user".as_bytes()
        ],
        bump = user.nonce,
    )]
    user: Box<Account<'info, User>>,
    // User Store.
    #[account(
        mut, 
        has_one = owner, 
        seeds = [
            owner.key.as_ref(), 
            pool.to_account_info().key.as_ref(),
            "user".as_bytes(),
            &[user_store.store_id]
        ],
        bump = user_store.nonce,
    )]
    user_store: Box<Account<'info, UserStore>>,
    #[account(
        mut,
        seeds = [
            pool.to_account_info().key.as_ref(),
            "reward_per_token".as_bytes(),
        ],
        bump = cm_reward_per_token.nonce,
    )]
    cm_reward_per_token: Box<Account<'info, CandyMachineRewardPerToken>>,
    owner: Signer<'info>,
    #[account(mut)]
    stake_from_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: This is nft metadata account. 
    metadata_info: UncheckedAccount<'info>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is pool signer with seeds
    pool_signer: UncheckedAccount<'info>,

    // Misc.
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut, 
        has_one = reward_vault,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut, 
    )]
    vault: Box<Account<'info, Vault>>,
    #[account(mut)]
    reward_vault: Box<Account<'info, TokenAccount>>,

    // User.
    #[account(
        mut,
        has_one = owner,
        has_one = pool,
        seeds = [
            owner.to_account_info().key.as_ref(),
            pool.to_account_info().key.as_ref(),
            "user".as_bytes()
        ],
        bump = user.nonce,
    )]
    user: Box<Account<'info, User>>,
    #[account(
        mut,
        seeds = [
            pool.to_account_info().key.as_ref(),
            "reward_per_token".as_bytes(),
        ],
        bump = cm_reward_per_token.nonce,
    )]
    cm_reward_per_token: Box<Account<'info, CandyMachineRewardPerToken>>,
    // User Store.
    #[account(
        mut,
        has_one = owner,
        seeds = [
            owner.to_account_info().key.as_ref(),
            pool.to_account_info().key.as_ref(),
            "user".as_bytes(),
            &[user_store.store_id]
        ],
        bump = user_store.nonce,
    )]
    user_store: Box<Account<'info, UserStore>>,
    owner: Signer<'info>,
    #[account(mut)]
    reward_account: Box<Account<'info, TokenAccount>>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is pool signer with seeds
    pool_signer: UncheckedAccount<'info>,

    // Misc.
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawReward<'info> {
    // Global accounts for the staking instance.
    #[account(
        mut, 
        has_one = reward_vault,
        constraint = pool.authority == *owner.key
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut
    )]
    reward_vault: Box<Account<'info, TokenAccount>>,

    owner: Signer<'info>,
    #[account(
        mut,
        constraint = reward_account.owner == *owner.key
    )]
    reward_account: Box<Account<'info, TokenAccount>>,

    // Program signers.
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is pool signer with seeds
    pool_signer: UncheckedAccount<'info>,

    // Misc.
    token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseNAccount<'info> {
    pool: Box<Account<'info, Pool>>,
    #[account(
        seeds = [
            pool.to_account_info().key.as_ref()
        ],
        bump = pool.nonce,
    )]
    /// CHECK: This is pool signer with seeds
    pool_signer: UncheckedAccount<'info>,
    close_account: Box<Account<'info, TokenAccount>>,
    owner: Signer<'info>,
    token_program: Program<'info, Token>,
    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseUser<'info> {
    #[account(
        mut, 
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        close = owner,
        has_one = owner,
        has_one = pool,
        seeds = [
            owner.to_account_info().key.as_ref(),
            pool.to_account_info().key.as_ref(),
            "user".as_bytes()
        ],
        bump = user.nonce,
        constraint = user.balance_staked == 0,
        constraint = user.stores == 0,
    )]
    user: Account<'info, User>,
    owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseUserStore<'info> {
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut, 
    )]
    user: Box<Account<'info, User>>,
    #[account(
        mut,
        close = owner,
        has_one = owner,
        seeds = [
            owner.to_account_info().key.as_ref(),
            pool.to_account_info().key.as_ref(),
            "user".as_bytes(),
            &[user_store.store_id]
        ],
        bump = user_store.nonce,
        constraint = user_store.reward_token_pending == 0,
    )]
    user_store: Account<'info, UserStore>,
    owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ManageCandyMachine<'info> {
    // Stake instance.
    #[account(
        mut,
        has_one = authority,
        constraint = !pool.paused,
    )]
    pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
    )]
    vault: Box<Account<'info, Vault>>,
    authority: Signer<'info>,
    // Misc.
    system_program: Program<'info, System>,
}

#[account]
pub struct Pool {
    /// Priviledged account.
    pub authority: Pubkey,
    /// Nonce to derive the program-derived address owning the vaults.
    pub nonce: u8,
    /// Paused state of the program
    pub paused: bool,
    /// Mint of the reward token.
    pub reward_mint: Pubkey,
    /// Vault to store reward tokens.
    pub reward_vault: Pubkey,
    /// Rate of reward distribution.
    pub reward_per_token: u64,
    /// Users staked
    pub user_stake_count: u32,
    pub balance_staked: u64,
}

#[account]
pub struct Vault {
    pub candy_machines: Vec<Pubkey>,
    pub reward_types: Vec<u8>,
    pub nonce: u8,
}

#[account]
pub struct CandyMachineRewardPerToken {
    pub candy_machines: Vec<Pubkey>,
    pub reward_per_tokens: Vec<u64>,
    pub nonce: u8,
}

#[account]
#[derive(Default)]
pub struct User {
    /// Pool the this user belongs to.
    pub pool: Pubkey,
    /// The owner of this account.
    pub owner: Pubkey,
    /// The amount of token pending claim.
    pub last_update_time: u64,
    /// The amount staked.
    pub balance_staked: u64,
    /// 
    pub nonce: u8,
    pub stores: u8,
}

#[account]
#[derive(Default)]
pub struct UserStore {
    pub owner: Pubkey,
    /// Signer nonce.
    pub nonce: u8,
    /// NFT mints stacked
    pub nft_mints: Vec<Pubkey>,
    pub types: Vec<u8>,
    pub staked_times: Vec<u64>,
    pub store_id: u8,
    /// The amount of token pending claim.
    pub reward_token_pending: u64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Pool is paused.")]
    PoolPaused,
    #[msg("Candy machine not found.")]
    CandyNotMatch,
}
