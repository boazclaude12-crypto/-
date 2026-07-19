import { NextResponse } from "next/server";
import { createClient } from '../../../../../lib/supabase/server';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import bs58 from 'bs58';

const RPC_URL = "https://api.mainnet-beta.solana.com";

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
    const { recipientAddress, amount } = body;

    // Validate inputs
    if (!recipientAddress) {
      return NextResponse.json({ error: "Missing recipient address" }, { status: 400 });
    }

    // Create connection
    const connection = new Connection(RPC_URL, 'confirmed');

    // Create sender keypair from private key
    const privateKeyBytes = bs58.decode(wallet.private_key);
    const senderKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyBytes));

    // Get sender's balance
    const balance = await connection.getBalance(senderKeypair.publicKey);
    
    // Calculate lamports to send
    const FEE_BUFFER = 5000; // Buffer for transaction fee
    let lamports: number;
    
    if (amount === "all") {
      // Send entire balance minus fee buffer
      lamports = balance - FEE_BUFFER;
      if (lamports <= 0) {
        return NextResponse.json({ error: "Insufficient balance to cover fees" }, { status: 400 });
      }
    } else {
      // Normal amount specified
      if (!amount) {
        return NextResponse.json({ error: "Missing amount" }, { status: 400 });
      }
      lamports = amount * LAMPORTS_PER_SOL;
      // Check if enough balance including fee buffer
      if (balance < lamports + FEE_BUFFER) {
        return NextResponse.json({ error: "Insufficient balance" }, { status: 400 });
      }
    }

    // Create transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderKeypair.publicKey,
        toPubkey: new PublicKey(recipientAddress),
        lamports
      })
    );

    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = senderKeypair.publicKey;

    // Sign transaction
    transaction.sign(senderKeypair);

    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 3
    });

    // First check if transaction was received
    const latestBlockhash = await connection.getLatestBlockhash('processed');
    
    // Wait for transaction to be processed with a reasonable timeout
    try {
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        },
        'processed' // Use processed commitment for faster feedback
      );

      if (confirmation.value?.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
      }

      // Get final transaction status
      const status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true
      });

      return NextResponse.json({
        success: true,
        signature,
        solscanUrl: `https://solscan.io/tx/${signature}`,
        confirmed: true,
        status: status.value?.confirmationStatus || 'processed'
      });

    } catch (error) {
      // Even if confirmation times out, check if transaction exists
      const status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true
      });

      // If we find the transaction, it's probably fine
      if (status.value && !status.value.err) {
        return NextResponse.json({
          success: true,
          signature,
          solscanUrl: `https://solscan.io/tx/${signature}`,
          confirmed: false,
          status: status.value.confirmationStatus || 'processed'
        });
      }

      throw error;
    }

  } catch (error: any) {
    console.error("Error sending SOL:", error);
    return NextResponse.json({ 
      error: error.message || "Internal error",
      details: error.response?.data 
    }, { status: 500 });
  }
} 