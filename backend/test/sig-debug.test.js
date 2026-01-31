import { ethers } from 'ethers';

const privateKey = '0x1234567890123456789012345678901234567890123456789012345678901234';
const wallet = new ethers.Wallet(privateKey);
const hash = '0x18397484f441b3549d3e2881f0db177165bbaf091f100644c46015bffa15a48e';

console.log('Wallet address:', wallet.address);
console.log('Hash:', hash);

// Method 1: signMessage (adds Ethereum prefix)
const sig1 = await wallet.signMessage(ethers.getBytes(hash));
console.log('\nMethod 1 (signMessage):');
console.log('Signature:', sig1);
const recovered1 = ethers.recoverAddress(hash, sig1);
console.log('Recovered:', recovered1);
console.log('Match:', recovered1.toLowerCase() === wallet.address.toLowerCase());

// Method 2: direct sign (no prefix)
const signingKey = new ethers.SigningKey(privateKey);
const sig2 = signingKey.sign(hash);
console.log('\nMethod 2 (direct sign):');
console.log('Signature:', '0x' + sig2.r.slice(2) + sig2.s.slice(2) + (sig2.v === 27 ? '1b' : '1c'));
const recovered2 = ethers.recoverAddress(hash, { r: '0x' + sig2.r.slice(2), s: '0x' + sig2.s.slice(2), v: sig2.v });
console.log('Recovered:', recovered2);
console.log('Match:', recovered2.toLowerCase() === wallet.address.toLowerCase());

// Try signing with prefix manually
const messageWithPrefix = '\x19' + 'Ethereum Signed Message:\n' + hash.length.toString() + hash.slice(2);
const hashWithPrefix = ethers.keccak256(ethers.toUtf8Bytes(messageWithPrefix));
const sig3 = signingKey.sign(hashWithPrefix);
console.log('\nMethod 3 (manual prefix):');
console.log('Hash with prefix:', hashWithPrefix);
console.log('Signature:', '0x' + sig3.r.slice(2) + sig3.s.slice(2) + (sig3.v === 27 ? '1b' : '1c'));
const recovered3 = ethers.recoverAddress(hashWithPrefix, { r: '0x' + sig3.r.slice(2), s: '0x' + sig3.s.slice(2), v: sig3.v });
console.log('Recovered:', recovered3);
console.log('Match:', recovered3.toLowerCase() === wallet.address.toLowerCase());
