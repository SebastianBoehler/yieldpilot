import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, http } from "viem";
import type { Client } from "viem";
import { arbitrum, base, optimism } from "viem/chains";
import { env, hasAgentWallet } from "@/lib/config/env";
import { CHAIN_CONFIGS, CHAIN_BY_ID } from "@/lib/config/constants";
import type { TransactionExecutionResult, TransactionPlanStep } from "@/types/domain";

const viemChains = {
  42161: arbitrum,
  8453: base,
  10: optimism,
} as const;

function getWalletClientForChain(chainId: number) {
  if (!hasAgentWallet || !env.AGENT_PRIVATE_KEY) {
    throw new Error("AGENT_PRIVATE_KEY is required for autonomous execution.");
  }

  const chain = CHAIN_BY_ID.get(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ${chainId}`);
  }

  const account = privateKeyToAccount(env.AGENT_PRIVATE_KEY as `0x${string}`);

  return createWalletClient({
    account,
    chain: viemChains[chain.id as keyof typeof viemChains],
    transport: http(chain.rpcUrl),
  });
}

function getPublicClientForChain(chainId: number) {
  const chain = CHAIN_BY_ID.get(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ${chainId}`);
  }

  return createPublicClient({
    chain: viemChains[chain.id as keyof typeof viemChains],
    transport: http(chain.rpcUrl),
  });
}

export async function checkTokenAllowance({
  chainId,
  tokenAddress,
  owner,
  spender,
}: {
  chainId: number;
  tokenAddress: `0x${string}`;
  owner: `0x${string}`;
  spender: `0x${string}`;
}) {
  const publicClient = getPublicClientForChain(chainId);
  return publicClient.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

export async function prepareApprovalTransaction({
  chainId,
  tokenAddress,
  spender,
  amount,
  assetSymbol,
}: {
  chainId: number;
  tokenAddress: `0x${string}`;
  spender: `0x${string}`;
  amount: bigint;
  assetSymbol: string;
}): Promise<TransactionPlanStep> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });

  return {
    stepKey: `approve-${chainId}-${tokenAddress}-${spender}`,
    title: `Approve ${assetSymbol}`,
    transactionType: "approve",
    chainId,
    to: tokenAddress,
    data,
    value: "0",
    spenderAddress: spender,
    description: `Approve ${spender} to spend ${assetSymbol}.`,
    protocol: "ERC20",
    assetSymbol,
    metadata: {
      spender,
      amount: amount.toString(),
    },
  };
}

export async function executeSignedTransaction(
  step: TransactionPlanStep,
): Promise<TransactionExecutionResult> {
  const walletClient = getWalletClientForChain(step.chainId);
  const publicClient = getPublicClientForChain(step.chainId);

  const hash = await walletClient.sendTransaction({
    account: walletClient.account!,
    to: step.to,
    data: step.data,
    value: step.value ? BigInt(step.value) : undefined,
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
  });

  const chain = CHAIN_BY_ID.get(step.chainId);

  return {
    status: receipt.status === "success" ? "CONFIRMED" : "FAILED",
    hash,
    chainId: step.chainId,
    explorerUrl: chain ? `${chain.blockExplorer}/tx/${hash}` : undefined,
  };
}

export async function getAutonomousWalletClientForChain(chainId: number): Promise<Client> {
  return getWalletClientForChain(chainId);
}

export function getAutonomousWalletAddress() {
  if (!hasAgentWallet || !env.AGENT_PRIVATE_KEY) {
    return undefined;
  }

  return privateKeyToAccount(env.AGENT_PRIVATE_KEY as `0x${string}`).address;
}

export function getSupportedChainWallets() {
  return CHAIN_CONFIGS.map((chain) => ({
    chainId: chain.id,
    address: getAutonomousWalletAddress(),
  }));
}
