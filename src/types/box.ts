export interface AvailableBox {
  id: number;
  serial: string;
  status?: 'AVAILABLE' | 'CLAIMED' | 'OPENED';
  isHidden?: boolean;
}

export interface AvailableBoxesResponse {
  boxes: AvailableBox[];
  totalAvailable: number;
  totalBoxesCount?: number;
  page: number;
  totalPages: number;
  limit: number;
  batchStart: string;
  batchEnd: string;
  totalBatchBoxes: number;
  openedCount?: number;
  claimedCount?: number;
  reservedWinningCount?: number;
  totalUnavailable?: number;
  hiddenCount?: number;
}

export interface BatchInfo {
  id: number;
  name: string;
  startSerial: string;
  endSerial: string;
  totalBoxes: number;
  price: number;
  currency: string;
  prize: string;
  prizeDescription: string;
  winnersPerBatch: number;
  totalBatches: number;
  totalPrizes: number;
}

export interface CustomerSession {
  valid: boolean;
  token: string;
  hasClaimed: boolean;
  assignedBox: string | null;
  batchId: number;
  opened: boolean;
  used?: boolean;
  alreadyUsed?: boolean;
  openedAt?: string;
  result?: 'WINNER' | 'BETTER_LUCK' | null;
  prizeName?: string | null;
  claimCode?: string | null;
}

export interface ClaimResult {
  success: boolean;
  boxSerial: string;
  alreadyClaimed?: boolean;
  error?: string;
}

export interface OpenResult {
  success: boolean;
  alreadyOpened: boolean;
  alreadyUsed?: boolean;
  boxSerial: string;
  result: 'WINNER' | 'BETTER_LUCK';
  prizeName?: string;
  openedAt: string;
  claimCode?: string;
}

export interface AdminBoxRecord {
  id: number;
  serial: string;
  status: 'AVAILABLE' | 'CLAIMED' | 'OPENED';
  claimed: boolean;
  claimedBy?: string;
  claimedAt?: string;
  opened?: boolean;
  openedAt?: string;
  result?: 'WINNER' | 'BETTER_LUCK';
  prizeName?: string;
  claimCode?: string;
  isHidden: boolean;
  isWinner: boolean;
  assignedPrize?: string;
}

export interface AdminStats {
  totalBoxes: number;
  availableBoxes: number;
  reservedBoxes?: number;
  hiddenBoxes: number;
  claimedBoxes: number;
  openedBoxes: number;
  winningBoxes: number;
  hiddenWinningBoxes: number;
  prizeDistribution: Record<string, number>;
}

export interface AdminPrizeRecord {
  serial: string;
  prizeName: string;
  isOpened: boolean;
  isClaimed: boolean;
  claimedBy?: string;
  openedAt?: string;
  claimCode?: string;
  isCardHidden: boolean;
  customNote?: string;
}

