/**
 * Kernel地址查询路由
 * GET /api/kernel/address
 */
import { config } from '../config.js';

/**
 * 返回Kernel和EntryPoint地址信息
 */
export function getKernelInfo(req, res) {
  res.json({
    kernelAddress: config.kernelAddress,
    entryPointAddress: config.entryPointAddress,
    chainId: config.chainId
  });
}
