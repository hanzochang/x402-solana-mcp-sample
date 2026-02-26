import { Keypair } from "@solana/web3.js";
import { base58 } from "@scure/base";

const keypair = Keypair.generate();
console.log("Address:", keypair.publicKey.toBase58());
console.log("PrivateKey:", base58.encode(keypair.secretKey));
