const axios = require('axios');
const { ethers } = require('ethers');
const proxyManager = require('./proxyManager');

// GoPlus Chain ID mapping
const GOPLUS_CHAIN_MAP = {
    'ethereum': '1',
    'eth': '1',
    'bsc': '56',
    'polygon': '137',
    'arbitrum': '42161',
    'optimism': '10',
    'avalanche': '43114',
    'base': '8453',
    'linea': '59144',
    'blast': '81457'
};

// RPC mapping for bytecode analysis
// Using multiple providers as fallbacks
const RPC_FALLBACKS = {
    'ethereum': [
        process.env.RPC_ETH,
        'https://eth.llamarpc.com',
        'https://ethereum.publicnode.com',
        'https://rpc.ankr.com/eth'
    ].filter(Boolean),
    'bsc': [
        process.env.RPC_BSC,
        'https://binance.llamarpc.com',
        'https://bsc-dataseed.binance.org',
        'https://rpc.ankr.com/bsc'
    ].filter(Boolean),
    'base': [
        process.env.RPC_BASE,
        'https://base.llamarpc.com',
        'https://base.publicnode.com',
        'https://developer-access-mainnet.base.org'
    ].filter(Boolean),
    'polygon': [
        process.env.RPC_POLYGON,
        'https://polygon.llamarpc.com',
        'https://polygon-rpc.com'
    ].filter(Boolean)
};

// Known Lockers (Exempted from risky status as they are audited lockers)
const KNOWN_LOCKERS = [
    '0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe', // PinkSale (BSC/ETH)
    '0x663a5c229c09b049e36dcc11a9b0d4a8eb9db214', // Unicrypt (ETH)
    '0xe2fe530c047f2d85298b07d9333c05737f143522', // Team Finance (ETH)
    '0x71b5759d73262fbb223956913e0708f50e532b21'  // FlokiFi (ETH)
];

const EXPLORER_APIS = {
    'ethereum': 'https://api.etherscan.io/api',
    'eth': 'https://api.etherscan.io/api',
    'bsc': 'https://api.bscscan.com/api',
    'base': 'https://api.basescan.org/api',
    'polygon': 'https://api.polygonscan.com/api',
    'arbitrum': 'https://api.arbiscan.io/api',
    'optimism': 'https://api-optimistic.etherscan.io/api',
    'avalanche': 'https://api.snowtrace.io/api'
};

/**
 * Fetches contract ABI from block explorers
 */
async function fetchContractABI(chainId, address) {
    const baseUrl = EXPLORER_APIS[chainId.toLowerCase()];
    if (!baseUrl) return null;

    try {
        const url = `${baseUrl}?module=contract&action=getabi&address=${address}`;
        const response = await axios.get(url, { timeout: 10000 });
        
        if (response.data && response.data.status === '1') {
            return response.data.result;
        }
        return null;
    } catch (error) {
        console.error(`[Security] ABI Fetch Error for ${address}:`, error.message);
        return null;
    }
}

/**
 * Analyzes ABI for token rescue backdoors
 */
function analyzeABI(abiString) {
    try {
        const abi = JSON.parse(abiString);
        const rescueFunctions = [];
        const suspiciousNames = ['rescue', 'recover', 'withdraw', 'sweep', 'claim', 'pull', 'emergency', 'transferany'];
        
        for (const item of abi) {
            if (item.type === 'function' && item.stateMutability !== 'view' && item.stateMutability !== 'pure') {
                const inputs = item.inputs || [];
                const hasAddressParam = inputs.some(input => input.type === 'address');
                const name = (item.name || '').toLowerCase();
                
                if (hasAddressParam) {
                    const isSuspicious = suspiciousNames.some(suspicious => name.includes(suspicious));
                    if (isSuspicious) {
                        rescueFunctions.push(item.name);
                    }
                }
            }
        }
        
        return { isVerified: true, hasRescue: rescueFunctions.length > 0, rescueFunctions };
    } catch (error) {
        return { isVerified: false, error: 'Failed to parse ABI' };
    }
}

/**
 * Fetches security data from GoPlus for EVM tokens
 */
async function fetchGoPlusData(chainId, tokenAddress) {
    const goPlusChainId = GOPLUS_CHAIN_MAP[chainId.toLowerCase()];
    if (!goPlusChainId) return null;

    try {
        const url = `https://api.gopluslabs.io/api/v1/token_security/${goPlusChainId}?contract_addresses=${tokenAddress}`;

        const options = { timeout: 10000 };
        const agent = proxyManager.getNextAgent();
        if (agent) {
            options.httpsAgent = agent;
            options.proxy = false;
        }

        const response = await axios.get(url, options);

        if (response.data && response.data.result) {
            return response.data.result[tokenAddress.toLowerCase()];
        }
        return null;
    } catch (error) {
        console.error(`[Security] GoPlus Error:`, error.message);
        return null;
    }
}

/**
 * Fetches security data from RugCheck for Solana tokens
 */
async function fetchRugCheckData(tokenAddress) {
    try {
        const url = `https://api.rugcheck.xyz/v1/tokens/${tokenAddress}/report`;
        const response = await axios.get(url, { timeout: 10000 });
        return response.data;
    } catch (error) {
        console.error(`[Security] RugCheck Error:`, error.message);
        return null;
    }
}

/**
 * Deterministic EVM Bytecode Parser
 * Safely parses bytecode, skipping PUSH data to prevent false positives
 */
function parseEVMBytecode(bytecodeHex) {
    const hex = bytecodeHex.startsWith('0x') ? bytecodeHex.slice(2) : bytecodeHex;
    const buf = Buffer.from(hex, 'hex');

    let hasDelegateCall = false;
    let hasSelfDestruct = false;
    let hasCall = false;

    let hasTransfer = false;
    let hasApprove = false;
    let hasTransferFrom = false;

    for (let i = 0; i < buf.length; i++) {
        const opcode = buf[i];

        if (opcode === 0xf4) hasDelegateCall = true;
        if (opcode === 0xff) hasSelfDestruct = true;
        if (opcode === 0xf1) hasCall = true;

        // Check for function selectors usually pushed via PUSH4 (0x63)
        if (opcode === 0x63 && i + 4 < buf.length) {
            const selector = buf.toString('hex', i + 1, i + 5);
            if (selector === 'a9059cbb') hasTransfer = true;
            if (selector === '095ea7b3') hasApprove = true;
            if (selector === '23b872dd') hasTransferFrom = true;
        }

        // Skip PUSH data (PUSH1 is 0x60, PUSH32 is 0x7f)
        if (opcode >= 0x60 && opcode <= 0x7f) {
            const pushDataLength = opcode - 0x5f;
            i += pushDataLength;
        }
    }

    const risks = [];
    const info = [];

    if (hasTransfer) risks.push('Transfer (a9059cbb)');
    if (hasApprove) risks.push('Approve (095ea7b3)');
    if (hasTransferFrom) risks.push('TransferFrom (23b872dd)');

    if (hasDelegateCall) risks.push('DelegateCall (f4) - PROXY RUG RISK');
    if (hasSelfDestruct) risks.push('Self Destruct (ff)');

    if (hasCall) info.push('Low-level CALL (f1) detected');

    return { risks, info };
}

/**
 * Analyzes bytecode for a contract address
 */
async function analyzeBytecode(chainId, address) {
    const urls = RPC_FALLBACKS[chainId.toLowerCase()];
    if (!urls || urls.length === 0) return { error: 'No RPC available for this chain' };

    let lastError = null;

    // Try each fallback URL
    for (const rpcUrl of urls) {
        try {
            let provider;
            const agent = proxyManager.getNextAgent();

            if (agent) {
                const fetchReq = new ethers.FetchRequest(rpcUrl);
                fetchReq.getUrlFunc = ethers.FetchRequest.createGetUrlFunc({
                    agent: agent
                });
                provider = new ethers.JsonRpcProvider(fetchReq);
            } else {
                provider = new ethers.JsonRpcProvider(rpcUrl);
            }

            let bytecode = await provider.getCode(address);
            if (bytecode.startsWith('0x')) bytecode = bytecode.slice(2);

            if (!bytecode || bytecode === '' || bytecode === '0x') {
                return { type: 'EOA', isContract: false };
            }

            const { risks, info } = parseEVMBytecode(bytecode);

            return {
                type: 'Contract',
                isContract: true,
                risks,
                info,
                bytecodeLength: bytecode.length
            };
        } catch (error) {
            lastError = error;
            // If it's a rate limit, try the next RPC immediately
            if (error.message.includes('429') || error.message.includes('rate-limited')) {
                console.warn(`[Security] RPC ${rpcUrl} rate limited, trying next...`);
                continue;
            }
            // For other errors, we might still want to try the next one
            console.warn(`[Security] RPC ${rpcUrl} failed: ${error.message}, trying next...`);
        }
    }

    return { error: lastError?.message || 'All RPCs failed' };
}

/**
 * Main security check function
 */
async function performSecurityCheck(chainId, tokenAddress) {
    const results = {
        chain: chainId,
        address: tokenAddress,
        summary: 'Unknown',
        riskLevel: 'Unknown',
        details: []
    };

    if (chainId.toLowerCase() === 'solana') {
        const rugData = await fetchRugCheckData(tokenAddress);
        if (rugData) {
            results.riskLevel = rugData.score < 500 ? 'Low' : rugData.score < 2000 ? 'Medium' : 'High';
            results.summary = rugData.score < 1000 ? 'Safe' : 'Risky';
            results.details.push(`RugCheck Score: ${rugData.score}`);
            results.details.push(`LP Burned: ${rugData.markets?.some(m => m.lp?.lpBurned) ? 'Yes' : 'No'}`);
            results.details.push(`Top Holders: ${rugData.topHolders?.length || 0}`);
        }
    } else {
        const goPlus = await fetchGoPlusData(chainId, tokenAddress);

        if (goPlus) {
            results.riskLevel = goPlus.is_honeypot === '1' ? 'Critical' : 'Audit Required';

            results.details.push(`LP Burned: ${parseFloat(goPlus.lp_burned_percentage || 0).toFixed(2)}%`);

            // Check top LP holders
            if (goPlus.lp_holders && goPlus.lp_holders.length > 0) {
                const topLP = goPlus.lp_holders[0];
                const lpPercent = (parseFloat(topLP.percent) * 100).toFixed(2);
                const holderAddress = topLP.address.toLowerCase();

                results.details.push(`Top LP Holder: ${topLP.address.slice(0, 8)}... (${lpPercent}%)`);

                // Known Burn Addresses
                const burnAddresses = [
                    '0x0000000000000000000000000000000000000000',
                    '0x000000000000000000000000000000000000dead',
                    '0x0000000000000000000000000000000000000001'
                ];

                if (burnAddresses.includes(holderAddress)) {
                    results.details.push('✅ Top LP Holder is a BURN ADDRESS. Liquidity is permanently destroyed.');
                    results.verdict = 'SAFE';
                } else if (KNOWN_LOCKERS.includes(holderAddress) || topLP.is_locked == 1) {
                    results.details.push('🔐 Top LP Holder is a KNOWN SECURE LOCKER.');
                    results.verdict = 'SAFE';
                } else if (holderAddress === tokenAddress.toLowerCase()) {
                    results.details.push('✅ Top LP Holder is the TOKEN CONTRACT ITSELF. (Manual Burn)');
                    results.details.push('The liquidity is trapped in the token contract (effectively burned).');
                    results.verdict = 'SAFE';
                } else if (topLP.is_contract == 1) {
                    results.details.push('🔍 Analyzing Top LP Holder Contract...');
                    
                    // Fetch both ABI and Bytecode
                    const audit = await analyzeBytecode(chainId, topLP.address);
                    const isProxy = audit.isContract && audit.risks.some(r => r.includes('f4'));
                    
                    const abiString = await fetchContractABI(chainId, topLP.address);
                    
                    if (abiString) {
                        const abiAnalysis = analyzeABI(abiString);
                        
                        if (abiAnalysis.hasRescue) {
                            results.details.push(`🚨 CRITICAL: Verified contract contains backdoors to pull tokens: ${abiAnalysis.rescueFunctions.join(', ')}`);
                            results.verdict = 'SCAM';
                        } else if (isProxy) {
                            results.details.push('⚠️ Contract is a PROXY (DelegateCall detected). Implementation can be changed to steal LP.');
                            results.verdict = 'RISKY';
                        } else {
                            results.details.push('✅ Top LP Holder is a verified contract with NO token rescue backdoors.');
                            results.verdict = 'SAFE';
                        }
                    } else {
                        // Unverified flow
                        results.details.push('⚠️ Contract is UNVERIFIED. Falling back to deep bytecode analysis...');
                        if (audit.error) {
                            results.details.push(`⚠️ Bytecode Analysis Error: ${audit.error}`);
                        } else if (audit.isContract) {
                            if (audit.risks.length === 0) {
                                results.details.push('✅ Unverified contract has NO movement logic.');
                                results.verdict = 'SAFE';
                            } else {
                                const dangerousRisks = audit.risks.filter(r => r.includes('f4') || r.includes('ff'));
                                if (dangerousRisks.length > 0) {
                                    results.details.push(`🚨 CRITICAL: Unverified contract has RUG code: ${dangerousRisks.join(', ')}`);
                                    results.verdict = 'SCAM';
                                } else {
                                    results.details.push(`⚠️ Unverified contract has movement code: ${audit.risks.join(', ')}`);
                                    results.details.push('Since the source code is hidden, it is mathematically possible for the dev to pull the LP.');
                                    results.verdict = 'RISKY';
                                }
                            }
                        } else if (audit.type === 'EOA') {
                            results.details.push('❌ Top LP Holder is a WALLET (Not Locked).');
                            results.verdict = 'SCAM';
                        }
                    }
                } else {
                    results.details.push('❌ Top LP Holder is a WALLET (Not Locked).');
                    results.verdict = 'SCAM';
                }
            }

            if (!results.verdict) {
                results.verdict = goPlus.is_honeypot === '1' ? 'SCAM' : 'NEUTRAL';
            }
            results.summary = goPlus.is_honeypot === '1' ? '💀 HONEYPOT' : 'Analyzed';
        }
    }

    return results;
}

module.exports = {
    performSecurityCheck,
    analyzeBytecode
};
