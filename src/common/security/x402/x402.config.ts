// src/common/security/x402/x402.config.ts

/**
 * Identificadores CAIP-2 para las redes soportadas por OPTUS.
 * El esquema v2 de x402 utiliza CAIP-2 para identificar blockchains de forma agnóstica.
 */
export const X402_NETWORKS = {
  AVALANCHE_FUJI: 'eip155:43113', // EVM Testnet
  BASE_SEPOLIA: 'eip155:84532', // EVM Testnet
  STELLAR_TESTNET: 'stellar:testnet', // Non-EVM Testnet
  ARC_TESTNET: 'eip155:2043', // EVM Testnet (Ajustar chainId si es diferente)
} as const;

export const X402_FACILITATOR_URL = 'https://x402.org/facilitator'; // URL para Testnets
