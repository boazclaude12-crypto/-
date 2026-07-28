// /src/app/api/wallet/route.ts
import { NextResponse } from "next/server";
import axios from "axios";
import { createClient } from '../../../../lib/supabase/server';
import { clusterApiUrl, Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAccount, TOKEN_PROGRAM_ID, getMint } from "@solana/spl-token";


async function getTokenInfo(tokenAddresses: string[]) {
  try {
    // Get token data from DexScreener - up to 30 addresses at once
    const chunks = [];
    for (let i = 0; i < tokenAddresses.length; i += 30) {
      chunks.push(tokenAddresses.slice(i, i + 30));
    }

    const responses = await Promise.all(
      chunks.map(chunk => 
        axios.get(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`)
      )
    );

    const tokenData: { [key: string]: any } = {};
    responses.forEach(response => {
      response.data.pairs?.forEach((pair: any) => {
        const baseToken = pair.baseToken;
        if (!tokenData[baseToken.address]) {
          tokenData[baseToken.address] = {
            name: baseToken.name || 'Unknown Token',
            symbol: baseToken.symbol || 'UNKNOWN',
            price: parseFloat(pair.priceUsd) || null,
            logo: pair.info?.imageUrl || null,
            verified: pair.labels?.includes('verified') || false
          };
        }
      });
    });

    return tokenData;
  } catch (error) {
    console.error("Error fetching token data:", error);
    return {};
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error || !wallet) {
      try {
        // Create a new wallet using Pump Portal API
        const walletResponse = await axios.get("https://pumpportal.fun/api/create-wallet");
        const walletData = walletResponse.data;

        // Insert the wallet data into Supabase
        const { data: newWallet, error: walletInsertError } = await supabase
          .from('wallets')
          .insert([{
            user_id: user.id,
            wallet_public_key: walletData.walletPublicKey,
            private_key: walletData.privateKey,
            api_key: walletData.apiKey
          }])
          .select()
          .single();

        if (walletInsertError) {
          console.error("Error creating wallet:", walletInsertError);
          return NextResponse.json({ error: "Failed to create wallet" }, { status: 500 });
        }

        // Create default user settings
        const { error: settingsError } = await supabase
          .from('user_settings')
          .insert([{
            user_id: user.id,
            priority_fee: 0.0005,
            slippage: 10
          }]);

        if (settingsError) {
          console.error("Error creating user settings:", settingsError);
          // Don't return error, continue as settings can be created later
        }

        return NextResponse.json({
          address: newWallet.wallet_public_key,
          solBalance: 0,
          solPrice: 0,
          solValue: 0,
          tokens: []
        });
      } catch (error) {
        console.error("Error creating wallet:", error);
        return NextResponse.json({ error: "Failed to create wallet" }, { status: 500 });
      }
    }

    if (!wallet.wallet_public_key) {
      return NextResponse.json({ 
        error: "No wallet address found",
        address: null,
        solBalance: 0,
        tokens: [] 
      });
    }

    const connection = new Connection(process.env.HELIUS_RPC_URL!, {
      commitment: 'confirmed'
    });
    
    const publicKey = new PublicKey(wallet.wallet_public_key);

    // Get SOL balance
    let balance;
    try {
      balance = await connection.getBalance(publicKey);
    } catch (e) {
      console.error("Failed to get balance:", e);
      balance = 0;
    }
    const solBalance = balance / LAMPORTS_PER_SOL;

    // Get all token accounts
    const tokenAccounts = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
      filters: [
        {
          dataSize: 165,
        },
        {
          memcmp: {
            offset: 32,
            bytes: publicKey.toBase58(),
          },
        },
      ],
    });

    // Process token accounts first to get mint addresses
    const tokenData = await Promise.all(
      tokenAccounts.map(async (tokenAccount) => {
        try {
          const account = await getAccount(connection, tokenAccount.pubkey);
          const mint = await getMint(connection, account.mint);
          
          if (account.amount === BigInt(0)) return null;

          return {
            mint: account.mint.toBase58(),
            balance: Number(account.amount) / Math.pow(10, mint.decimals),
            decimals: mint.decimals,
          };
        } catch (error) {
          console.error(`Error processing token account:`, error);
          return null;
        }
      })
    );

    const validTokenData = tokenData.filter(token => token !== null);
    
    // Get token info from DexScreener
    const tokenInfo = await getTokenInfo(validTokenData.map(token => token!.mint));

    // Get user's created tokens from token_mints table
    const { data: createdTokens } = await supabase
      .from('token_mints')
      .select('mint_public_key')
      .eq('user_id', user.id);

    const createdTokenMints = new Set(createdTokens?.map(t => t.mint_public_key) || []);

    // Combine token data
    const tokens = validTokenData.map(token => {
      const info = tokenInfo[token!.mint] || {};
      return {
        mint: token!.mint,
        balance: token!.balance,
        decimals: token!.decimals,
        name: info.name || 'Unknown Token',
        symbol: info.symbol || 'UNKNOWN',
        logo: info.logo || null,
        verified: info.verified || false,
        usdPrice: info.price || null,
        usdValue: info.price ? token!.balance * info.price : null,
        isCreator: createdTokenMints.has(token!.mint)
      };
    });

    // Get SOL price from DexScreener
    let solPrice = 0;
    try {
      const solResponse = await axios.get('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
      solPrice = parseFloat(solResponse.data.pairs?.[0]?.priceUsd) || 0;
    } catch (error) {
      console.error("Error fetching SOL price:", error);
    }

    return NextResponse.json({
      address: wallet.wallet_public_key,
      solBalance,
      solPrice,
      solValue: solBalance * solPrice,
      tokens
    });

  } catch (error: any) {
    console.error("Error in wallet API:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}

