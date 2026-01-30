# Tasks: Implement Kernel Contract

## 1.1 实现Kernel.sol核心合约
- [ ] 创建Kernel.sol文件
- [ ] 实现constructor(address _entryPoint)
- [ ] 实现validateUserOp函数
  - [ ] EntryPoint权限检查
  - [ ] ECDSA签名验证
  - [ ] Nonce验证与递增
  - [ ] ERC20 gas支付处理
- [ ] 实现executeBatch函数
  - [ ] 权限检查
  - [ ] 循环执行calls
  - [ ] 错误处理（任意失败全revert）
- [ ] 实现getNonce函数
- [ ] 定义Call结构体
- [ ] 添加必要的接口和错误定义

## 1.2 测试validateUserOp功能
- [ ] testValidateUserOp_Success - 正常验证流程
- [ ] testValidateUserOp_WithGasPayment - USDC支付gas
- [ ] testValidateUserOp_InvalidSignature - 无效签名拒绝
- [ ] testValidateUserOp_WrongNonce - 错误nonce拒绝
- [ ] testValidateUserOp_OnlyEntryPoint - 权限检查

## 1.3 测试executeBatch功能
- [ ] testExecuteBatch_Success - 多个call顺序执行
- [ ] testExecuteBatch_FailedCall - 任意call失败全revert
- [ ] testExecuteBatch_OnlyEntryPoint - 权限检查

## 1.4 测试Nonce管理和Gas支付
- [ ] testGetNonce_NewAddress - 新地址返回0
- [ ] testGetNonce_AfterExecution - 执行后nonce递增
- [ ] 运行完整测试套件：forge test -vvv --gas-report
- [ ] 确保测试覆盖率100%

## 完成标准
- ✅ 所有测试通过 (10/10)
- ✅ Gas报告生成
- ✅ 代码有中文注释
- ✅ 符合OpenSpec规范
