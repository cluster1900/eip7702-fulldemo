# Tasks: Implement Frontend

## 3.1 创建HTML页面
- [ ] 创建frontend/目录
- [ ] 创建index.html (基础结构)
  - [ ] 引入ethers.js CDN
  - [ ] 连接钱包按钮
  - [ ] 显示地址和余额区域
  - [ ] 构建交易表单 (target, value, data)
  - [ ] 提交按钮
  - [ ] 结果显示区域
- [ ] 创建style.css (简洁样式)
  - [ ] 响应式布局
  - [ ] 按钮和输入框样式
  - [ ] 状态指示 (loading, success, error)

## 3.2 实现Web3连接
- [ ] 创建app.js
- [ ] 检测window.ethereum
- [ ] 实现connectWallet函数
  - [ ] provider = new ethers.BrowserProvider(window.ethereum)
  - [ ] signer = await provider.getSigner()
  - [ ] 显示地址: await signer.getAddress()
  - [ ] 查询余额: await provider.getBalance(address)
  - [ ] 更新UI显示

## 3.3 实现UserOp构建
- [ ] 实现buildUserOp函数
  - [ ] 读取表单输入 (target, value, data)
  - [ ] 查询nonce: fetch('/api/nonce/' + sender)
  - [ ] 构建calls数组 [{ target, value, data }]
  - [ ] 编码callData: Kernel.interface.encodeFunctionData('executeBatch', [calls])
  - [ ] 设置paymasterAndData: ethers.AbiCoder.encode(['address', 'uint256'], [USDC_ADDRESS, amount])
  - [ ] 构建userOp对象
- [ ] 实现signUserOp函数
  - [ ] 计算userOpHash (简化版keccak256)
  - [ ] signature = await signer.signMessage(arrayify(userOpHash))
  - [ ] 更新userOp.signature

## 3.4 实现Authorization签名
- [ ] 实现checkDelegationStatus函数
  - [ ] fetch('/api/delegation-status/' + address)
  - [ ] 返回{ delegated, eoaNonce, userOpNonce }
- [ ] 实现signAuthorization函数
  - [ ] 如果!delegated，构建authorization
  - [ ] 计算authHash: keccak256(encode([chainId, KERNEL_ADDRESS, eoaNonce]))
  - [ ] signature = await signer.signMessage(...)
  - [ ] 返回{ chainId, address: KERNEL_ADDRESS, nonce: eoaNonce, signature }

## 3.5 实现提交和结果显示
- [ ] 实现submitTransaction函数
  - [ ] 显示Loading状态
  - [ ] userOp = await buildUserOp()
  - [ ] userOp = await signUserOp(userOp)
  - [ ] status = await checkDelegationStatus()
  - [ ] authorization = status.delegated ? null : await signAuthorization(status.eoaNonce)
  - [ ] response = await fetch('/api/execute', { method: 'POST', body: JSON.stringify({ userOp, authorization }) })
  - [ ] 显示结果: txHash, delegated状态
  - [ ] 生成区块浏览器链接
- [ ] 错误处理
  - [ ] 捕获fetch错误
  - [ ] 显示用户友好的错误消息
  - [ ] 签名被拒绝提示

## 3.6 测试完整流程
- [ ] 打开index.html (或启动简单HTTP服务器)
- [ ] 连接MetaMask
- [ ] 测试首次使用 (需签名authorization)
- [ ] 测试后续使用 (无需authorization)
- [ ] 验证txHash在链上
- [ ] 测试错误场景 (余额不足, 签名拒绝等)

## 完成标准
- ✅ 页面可正常访问
- ✅ MetaMask连接成功
- ✅ UserOp构建和签名正确
- ✅ 提交到backend成功
- ✅ 结果正确显示
- ✅ 代码有中文注释
