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
  // 使用本地部署到主网分叉时:
  // - EntryPoint: 0xD3eCE3409B27Aa484c303a41ec4ba83C4973335A (本地部署)
  // - Kernel: 0x1BBED5cE00949dc5b16E9f6A2e8A71F37c6FE86a (本地部署)
  entryPointAddress: process.env.ENTRY_POINT_ADDRESS || '0x5fc8d32690cc91d4c39d9d3abcbd16989f875707',
  kernelAddress: process.env.KERNEL_ADDRESS || '0x1BBED5cE00949dc5b16E9f6A2e8A71F37c6FE86a',

  // 代币地址 (用于gas补偿) - MockUSDC
  tokenAddress: process.env.TOKEN_ADDRESS || '0xC3CEec5Ba25E4762a3218beac49A40681B9CC5cb',

  // 服务器配置
  port: parseInt(process.env.PORT || '3000'),

  // 缓存配置
  cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '300'),
};
