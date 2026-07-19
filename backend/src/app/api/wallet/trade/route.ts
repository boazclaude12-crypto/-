// /src/app/api/trade/route.ts
import { NextResponse } from "next/server";
import { createClient } from '../../../../../lib/supabase/server';
import axios from "axios";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import bs58 from 'bs58';

const RPC_URL = "https://api.mainnet-beta.solana.com/";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!wallet?.private_key) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    const body = await req.json();
    const { action, mint, amount } = body;

    // Step 1: Get transaction from Pump Portal
    console.log("Sending request to Pump.Fun API...");
    const params = new URLSearchParams({
      publicKey: wallet.wallet_public_key,
      action: action,
      mint: mint,
      amount: action === "sell" ? "100%" : amount.toString(),
      denominatedInSol: "true",
      slippage: "100",
      priorityFee: "0.005",
      pool: "pump"
    });

    const response = await axios.post(
      "https://pumpportal.fun/api/trade-local",
      params.toString(),
      { 
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    if (response.status !== 200) {
      throw new Error("Failed to create transaction");
    }

    // Step 2: Create keypair from private key
    console.log("Generating Keypair from private key...");
    const privateKeyBytes = bs58.decode(wallet.private_key);
    const keypair = Keypair.fromSecretKey(new Uint8Array(privateKeyBytes));

    // Step 3: Create transaction
    console.log("Creating transaction...");
    const tx = VersionedTransaction.deserialize(response.data);
    tx.sign([keypair]);

    // Step 4: Send transaction directly to RPC like in Python
    console.log("Sending transaction to Solana network...");
    const txPayload = {
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: [
        bs58.encode(tx.serialize()),
        {
          encoding: "base58",
          skipPreflight: true,
          preflightCommitment: "confirmed",
          maxRetries: 3
        }
      ]
    };

    const txResponse = await axios.post(
      RPC_URL,
      txPayload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000
      }
    );

    if (txResponse.status !== 200 || !txResponse.data.result) {
      throw new Error("Failed to send transaction");
    }

    const txSignature = txResponse.data.result;
    console.log("Transaction Successful! ✅");
    console.log(`Transaction: https://solscan.io/tx/${txSignature}`);

    return NextResponse.json({
      success: true,
      signature: txSignature,
      solscanUrl: `https://solscan.io/tx/${txSignature}`
    });

  } catch (error: any) {
    console.error("Error processing trade:", error);
    return NextResponse.json({ 
      error: error.message || "Internal error",
      details: error.response?.data 
    }, { status: 500 });
  }
}
