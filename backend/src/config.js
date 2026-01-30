/**
 * 环境配置模块
 * 从.env文件加载配置参数
 */
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // 区块链配置
  rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
  chainId: parseInt(process.env.CHAIN_ID || '31337'),
  
  // Bundler配置
  bundlerPrivateKey: process.env.BUNDLER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  
  // 合约地址
  kernelAddress: process.env.KERNEL_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  entryPointAddress: process.env.ENTRY_POINT_ADDRESS || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  
  // 服务器配置
  port: parseInt(process.env.PORT || '3000'),
  
  // 缓存配置
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '300'),
};
