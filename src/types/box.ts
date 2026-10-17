export interface AvailableBox {
  id: number;
  serial: string;
}

export interface AvailableBoxesResponse {
  boxes: AvailableBox[];
  totalAvailable: number;
  page: number;
  totalPages: number;
  limit: number;
  batchStart: string;
  batchEnd: string;
  totalBatchBoxes: number;
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
