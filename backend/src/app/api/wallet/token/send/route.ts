import { NextResponse } from "next/server";
import { createClient } from '../../../../../../lib/supabase/server';
import { Connection, PublicKey, Transaction, VersionedTransaction, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import bs58 from 'bs58';
import { ComputeBudgetProgram } from "@solana/web3.js";

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
    const { recipientAddress, amount, tokenMint } = body;

    const connection = new Connection(RPC_URL);
    const senderKeypair = Keypair.fromSecretKey(new Uint8Array(bs58.decode(wallet.private_key)));
    const senderPublicKey = new PublicKey(wallet.wallet_public_key);
    const recipientPublicKey = new PublicKey(recipientAddress);
    const mintPublicKey = new PublicKey(tokenMint);

    // Get token accounts
    const senderATA = await getAssociatedTokenAddress(mintPublicKey, senderPublicKey);
    const recipientATA = await getAssociatedTokenAddress(mintPublicKey, recipientPublicKey);

    // Create ATA for recipient if it doesn't exist
    const recipientATAInfo = await connection.getAccountInfo(recipientATA);
    let instructions = [];

    if (!recipientATAInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          senderPublicKey,  // payer
          recipientATA,     // ata
          recipientPublicKey, // owner
          mintPublicKey     // mint
        )
      );
    }

    // Create transfer instruction
    const transferInstruction = createTransferInstruction(
      senderATA,
      recipientATA,
      senderPublicKey,
      BigInt(amount)
    );

    // Add transfer instruction
    instructions.push(transferInstruction);

    // Create transaction with all instructions
    const transaction = new Transaction().add(...instructions);

    // After getting the blockhash, add priority fee and retry logic
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    transaction.feePayer = senderPublicKey;
    transaction.recentBlockhash = latestBlockhash.blockhash;

    // Add priority fee to help transaction process faster
    const priorityFee = 0.000005 * LAMPORTS_PER_SOL; // 0.000005 SOL
    transaction.instructions.unshift(
      ComputeBudgetProgram.setComputeUnitPrice({ 
        microLamports: Math.trunc(priorityFee) 
      })
    );

    // Convert to VersionedTransaction
    const versionedTx = new VersionedTransaction(transaction.compileMessage());
    versionedTx.sign([senderKeypair]);

    // Send transaction with single retry
    let signature;
    try {
      signature = await connection.sendTransaction(versionedTx, {
        skipPreflight: true,
        maxRetries: 1,
        preflightCommitment: 'confirmed'
      });

      // Quick initial confirmation check (2 seconds)
      try {
        await connection.confirmTransaction({
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        }, 'processed');
      } catch (e) {
        // Ignore confirmation timeout - transaction might still be processing
        console.log("Initial confirmation timed out, but tx may still succeed");
      }

      return NextResponse.json({
        success: true,
        signature,
        solscanUrl: `https://solscan.io/tx/${signature}`,
        confirmed: false,
        status: 'processing'
      });

    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to send transaction: ${error.message}`);
      }
      throw new Error('Failed to send transaction: Unknown error');
    }

  } catch (error: any) {
    console.error("Error sending token:", error);
    return NextResponse.json({ 
      error: error.message || "Internal error",
      details: error.response?.data 
    }, { status: 500 });
  }
} 