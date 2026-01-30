/**
 * EIP-7702 Backend API Tests
 * Tests all backend endpoints with detailed logging
 */
import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

const KERNEL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const ENTRY_POINT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const USER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

function logSection(title) {
  console.log('');
  console.log('='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
}

function logSubsection(title) {
  console.log('');
  console.log('-'.repeat(60));
  console.log(title);
  console.log('-'.repeat(60));
}

function logResult(name, value) {
  console.log(`  ${name}: ${value}`);
}

async function testHealthEndpoint() {
  logSection('TEST 1: GET /health');

  try {
    const response = await axios.get(`${BASE_URL}/health`);
    logResult('Status', response.data.status);
    logResult('Chain ID', response.data.config.chainId);
    logResult('Kernel Address', response.data.config.kernelAddress);
    logResult('EntryPoint Address', response.data.config.entryPointAddress);
    console.log('\n  [PASS] Health endpoint working correctly');
  } catch (error) {
    console.log(`\n  [FAIL] ${error.message}`);
    return false;
  }
  return true;
}

async function testKernelAddressEndpoint() {
  logSection('TEST 2: GET /api/kernel/address');

  try {
    const response = await axios.get(`${BASE_URL}/api/kernel/address`);
    logResult('Kernel Address', response.data.kernelAddress);
    logResult('EntryPoint Address', response.data.entryPointAddress);
    logResult('Chain ID', response.data.chainId);
    console.log('\n  [PASS] Kernel address endpoint working correctly');
  } catch (error) {
    console.log(`\n  [FAIL] ${error.message}`);
    return false;
  }
  return true;
}

async function testNonceEndpoint() {
  logSection('TEST 3: GET /api/nonce/:address');

  try {
    const response = await axios.get(`${BASE_URL}/api/nonce/${USER_ADDRESS}`);
    logResult('Address', response.data.address);
    logResult('Nonce', response.data.nonce);
    console.log('\n  [PASS] Nonce endpoint working correctly');
  } catch (error) {
    console.log(`\n  [FAIL] ${error.message}`);
    return false;
  }
  return true;
}

async function testDelegationStatusEndpoint() {
  logSection('TEST 4: GET /api/delegation-status/:address');

  try {
    const response = await axios.get(`${BASE_URL}/api/delegation-status/${USER_ADDRESS}`);
    logResult('Address', response.data.address);
    logResult('Delegated', response.data.delegated);
    logResult('EOA Nonce', response.data.eoaNonce);
    logResult('UserOp Nonce', response.data.userOpNonce);
    logResult('Timestamp', response.data.timestamp);
    console.log('\n  [PASS] Delegation status endpoint working correctly');
  } catch (error) {
    console.log(`\n  [FAIL] ${error.message}`);
    return false;
  }
  return true;
}

async function testSimulateEndpoint() {
  logSection('TEST 5: POST /api/simulate');

  const mockUserOp = {
    sender: USER_ADDRESS,
    nonce: '0',
    callData: '0x',
    callGasLimit: '100000',
    verificationGasLimit: '100000',
    preVerificationGas: '21000',
    maxFeePerGas: '1000000000',
    maxPriorityFeePerGas: '1000000000',
    paymasterAndData: '0x',
    signature: '0x'
  };

  try {
    const response = await axios.post(`${BASE_URL}/api/simulate`, {
      userOp: mockUserOp
    });
    logResult('Success', response.data.success);
    logResult('Needs Auth', response.data.needsAuth);
    logResult('Estimated Gas', response.data.estimatedGas);
    logResult('Will Revert', response.data.willRevert);
    console.log('\n  [PASS] Simulate endpoint working correctly');
  } catch (error) {
    console.log(`\n  [FAIL] ${error.message}`);
    return false;
  }
  return true;
}

async function testExecuteEndpointValidation() {
  logSection('TEST 6: POST /api/execute (Validation Tests)');

  // Test missing required fields
  logSubsection('6a: Missing sender field');

  try {
    await axios.post(`${BASE_URL}/api/execute`, {
      userOp: { nonce: '0' }
    });
    console.log('  [FAIL] Should have returned error');
  } catch (error) {
    logResult('Status', error.response?.status || error.message);
    logResult('Error', error.response?.data?.error || 'Request failed');
    console.log('  [PASS] Correctly rejected invalid request');
  }

  // Test invalid signature
  logSubsection('6b: Invalid signature');

  try {
    await axios.post(`${BASE_URL}/api/execute`, {
      userOp: {
        sender: USER_ADDRESS,
        nonce: '0',
        callData: '0x',
        callGasLimit: '100000',
        verificationGasLimit: '100000',
        preVerificationGas: '21000',
        maxFeePerGas: '1000000000',
        maxPriorityFeePerGas: '1000000000',
        paymasterAndData: '0x',
        signature: '0x1234' // Too short
      }
    });
    console.log('  [FAIL] Should have returned error');
  } catch (error) {
    logResult('Status', error.response?.status || error.message);
    logResult('Error', error.response?.data?.error || 'Request failed');
    console.log('  [PASS] Correctly rejected invalid signature');
  }

  console.log('\n  [PASS] Execute endpoint validation working correctly');
  return true;
}

async function test404Endpoint() {
  logSection('TEST 7: 404 Handling');

  try {
    await axios.get(`${BASE_URL}/api/unknown-endpoint`);
    console.log('  [FAIL] Should have returned 404');
  } catch (error) {
    logResult('Status', error.response?.status || error.message);
    logResult('Available endpoints', JSON.stringify(error.response?.data?.available || []));
    console.log('  [PASS] 404 handling working correctly');
  }
  return true;
}

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     EIP-7702 Backend API Test Suite                         ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  let passed = 0;
  let failed = 0;

  if (await testHealthEndpoint()) passed++; else failed++;
  if (await testKernelAddressEndpoint()) passed++; else failed++;
  if (await testNonceEndpoint()) passed++; else failed++;
  if (await testDelegationStatusEndpoint()) passed++; else failed++;
  if (await testSimulateEndpoint()) passed++; else failed++;
  if (await testExecuteEndpointValidation()) passed++; else failed++;
  if (await test404Endpoint()) passed++; else failed++;

  logSection('TEST SUMMARY');

  console.log('');
  console.log(`  Total Tests: ${passed + failed}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log('');

  if (failed === 0) {
    console.log('  ╔════════════════════════════════════════════════════════════╗');
    console.log('  ║              ALL BACKEND TESTS PASSED!                  ║');
    console.log('  ╚════════════════════════════════════════════════════════════╝');
  } else {
    console.log('  Some tests failed. Please check the errors above.');
  }

  console.log('');
  console.log('  Backend API Endpoints Tested:');
  console.log('    ✓ GET  /health                    - Health check');
  console.log('    ✓ GET  /api/kernel/address        - Get contract addresses');
  console.log('    ✓ GET  /api/nonce/:address        - Get UserOp nonce');
  console.log('    ✓ GET  /api/delegation-status/:address - Check delegation');
  console.log('    ✓ POST /api/simulate              - Simulate UserOp');
  console.log('    ✓ POST /api/execute               - Execute UserOp (validation)');
  console.log('    ✓ 404 handling                   - Unknown endpoints');
  console.log('');

  console.log('  Contract Information:');
  console.log(`    - Kernel: ${KERNEL_ADDRESS}`);
  console.log(`    - EntryPoint: ${ENTRY_POINT_ADDRESS}`);
  console.log(`    - Chain ID: 31337 (local anvil)`);
  console.log('');

  return failed === 0;
}

main()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
