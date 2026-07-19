// /src/app/api/token/create/route.ts
import { NextResponse } from "next/server";
import { createClient } from '../../../../../../lib/supabase/server';
import axios from "axios";
import { Keypair, VersionedTransaction, Connection } from "@solana/web3.js";
import bs58 from 'bs58';

const RPC_ENDPOINT = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";

// This endpoint expects a multipart/form-data request.
// You may use a library like formidable or multer in a custom handler if needed.
export async function POST(req: Request) {
  try {
    console.log("Token creation API called");
    
    // Get user from session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check if user has a paid plan
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("plan_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.plan_id || profile.plan_id === 7) {
      return NextResponse.json({ error: "You need a paid plan to create tokens" }, { status: 403 });
    }

    // Check if user has a wallet
    const { data: existingWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    let wallet = existingWallet;

    // Create wallet if doesn't exist using Pump Portal API
    if (!wallet) {
      try {
        const walletResponse = await axios.get("https://pumpportal.fun/api/create-wallet");
        const walletData = walletResponse.data;

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
          throw new Error("Failed to create wallet");
        }

        wallet = newWallet;
      } catch (error) {
        console.error("Error creating wallet:", error);
        return NextResponse.json({ error: "Failed to create wallet" }, { status: 500 });
      }
    }

    if (!wallet?.api_key) {
      return NextResponse.json({ error: "Wallet API key not found" }, { status: 404 });
    }

    // Parse the request body
    const body = await req.json();
    console.log("Received request body fields:", Object.keys(body));
    
    const { 
      name, 
      symbol, 
      description, 
      twitter, 
      telegram, 
      website, 
      devBuyAmount,
      image 
    } = body;
    
    // Validate inputs
    if (!name || !symbol || !devBuyAmount || !description || !twitter || !telegram || !website || !image) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Generate a new mint keypair
    const mintKeypair = Keypair.generate();
    console.log("Generated mint public key:", mintKeypair.publicKey.toString());

    // Upload image to IPFS
    try {
      console.log("Starting image upload process...");
      
      // Convert base64 to blob
      const base64Data = image.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const blob = new Blob([buffer], { type: 'image/png' });
      
      // Create FormData for IPFS upload
      const imageFormData = new FormData();
      imageFormData.append("file", blob, "image.png");
      imageFormData.append("name", name);
      imageFormData.append("symbol", symbol);
      imageFormData.append("description", description);
      imageFormData.append("twitter", twitter);
      imageFormData.append("telegram", telegram);
      imageFormData.append("website", website);
      imageFormData.append("showName", "true");
      
      console.log("Sending request to IPFS API...");
      const ipfsResponse = await fetch("https://pump.fun/api/ipfs", {
        method: "POST",
        body: imageFormData,
      });
      
      if (!ipfsResponse.ok) {
        const errorText = await ipfsResponse.text();
        console.error("IPFS upload failed. Status:", ipfsResponse.status, "Response:", errorText);
        return NextResponse.json({ error: "Failed to upload image to IPFS" }, { status: 500 });
      }
      
      const ipfsData = await ipfsResponse.json();
      console.log("IPFS response:", ipfsData);

      // Create token using Pump Portal's local transaction API
      const tokenPayload = {
        publicKey: wallet.wallet_public_key,
        action: "create",
        tokenMetadata: {
          name: ipfsData.metadata.name,
          symbol: ipfsData.metadata.symbol,
          uri: ipfsData.metadataUri
        },
        mint: mintKeypair.publicKey.toString(),
        denominatedInSol: "true",
        amount: devBuyAmount,
        slippage: 10,
        priorityFee: 0.0005,
        pool: "pump"
      };

      console.log("Sending request to Pump Portal local transaction API...");

      const response = await axios.post(
        "https://pumpportal.fun/api/trade-local",
        tokenPayload,
        {
          headers: { "Content-Type": "application/json" },
          responseType: 'arraybuffer'
        }
      );

      if (response.status !== 200) {
        console.error("Pump Portal returned error:", response.data.toString());
        return NextResponse.json({ error: "Failed to create token transaction" }, { status: 400 });
      }

      // Create a connection to the Solana network
      let connection = new Connection(RPC_ENDPOINT);

      // Get the latest blockhash BEFORE deserializing the transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

      // Deserialize and sign the transaction
      const tx = VersionedTransaction.deserialize(response.data);

      // Set the blockhash
      tx.message.recentBlockhash = blockhash;

      // Decode the private key from base58
      const privateKeyBytes = bs58.decode(wallet.private_key);
      const signerKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyBytes));
      
      // Sign with both keypairs
      tx.sign([mintKeypair, signerKeypair]);

      // Send the signed transaction with proper options
      const txSignature = await connection.sendTransaction(tx, {
        skipPreflight: true, // Skip preflight to see actual error
        maxRetries: 3
      });

      try {
        // Wait for confirmation with timeout
        const confirmation = await connection.confirmTransaction({
          signature: txSignature,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight
        }, 'confirmed');

        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${confirmation.value.err.toString()}`);
        }
      } catch (error) {
        // If confirmation fails, try to get transaction status
        const status = await connection.getSignatureStatus(txSignature);
        console.error("Transaction status:", status);
        throw error;
      }

      // Store the mint keypair for future use
      const { error: mintKeyError } = await supabase
        .from('token_mints')
        .insert([{
          user_id: user.id,
          mint_public_key: mintKeypair.publicKey.toString(),
          mint_private_key: bs58.encode(mintKeypair.secretKey),
          token_name: name,
          token_symbol: symbol
        }]);

      if (mintKeyError) {
        console.error("Error storing mint keypair:", mintKeyError);
      }

      console.log("Token created successfully. Transaction signature:", txSignature);
      return NextResponse.json({
        signature: txSignature,
        tokenAddress: mintKeypair.publicKey.toString()
      });
    } catch (error) {
      console.error("Error during token creation:", error);
      return NextResponse.json({ error: (error as Error).message || "Internal error" }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Detailed error in token creation API:", {
      error,
      message: error.message,
      stack: error.stack
    });
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
