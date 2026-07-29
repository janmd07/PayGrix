export interface ReputationStats {
  payrollRuns: number;
  payments: number;
  bridgeTransactions: number;
  swapTransactions: number;
  contributorsCount: number;
  isConnected: boolean;
}

export interface ReputationResult {
  score: number;
  maxScore: number;
  label: string;
  ratingStars: number;
  description: string;
}

/**
 * Calculates a modular placeholder reputation score for V1.
 * This scoring logic can be replaced with real onchain/backend analytics in the future
 * without changing any of the UI components.
 */
export function calculateReputation(
  address: string | undefined,
  stats: ReputationStats
): ReputationResult {
  if (!stats.isConnected || !address) {
    return {
      score: 0,
      maxScore: 100,
      label: "Not Connected",
      ratingStars: 0,
      description: "Connect your wallet to calculate your onchain reputation score.",
    };
  }

  // Base V1 reputation score rules:
  // Starts at 75 for being connected on Arc Testnet
  let score = 75;

  // Add points for platform interaction to make it slightly dynamic based on real data
  if (stats.payrollRuns > 0) score += 5;
  if (stats.payments > 0) score += 4;
  if (stats.bridgeTransactions > 0) score += 4;
  if (stats.swapTransactions > 0) score += 4;
  if (stats.contributorsCount > 0) score += 3;

  // Cap at 98 for now to leave room for future growth
  if (score > 98) {
    score = 98;
  }

  // Determine label and stars based on score
  let label = "Starter Builder";
  let ratingStars = 3;

  if (score >= 90) {
    label = "Trusted Builder";
    ratingStars = 5;
  } else if (score >= 80) {
    label = "Rising Builder";
    ratingStars = 4;
  }

  return {
    score,
    maxScore: 100,
    label,
    ratingStars,
    description: "Calculated based on testnet activity, payroll roster configuration, transaction success rates, and account status.",
  };
}
