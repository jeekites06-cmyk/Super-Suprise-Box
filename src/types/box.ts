export interface AvailableBox {
  id: number;
  serial: string;
  status?: 'AVAILABLE' | 'CLAIMED' | 'OPENED';
  isHidden?: boolean;
}

export interface AvailableBoxesResponse {
  boxes: AvailableBox[];
  totalInventory?: number;
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
  reservedCount?: number;
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
  isMainPage?: boolean;
  revoked?: boolean;
  forbidden?: boolean;
  isForwardedLink?: boolean;
  error?: string;
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

export interface PublicPrize {
  serial: string;
  prizeName: string;
  isOpened: boolean;
  isClaimed: boolean;
  customNote?: string;
}

export interface AdminCustomerLink {
  id: number;
  tokenHash: string;
  tokenPrefix: string;
  boxId: number;
  boxSerial: string;
  status: 'UNUSED' | 'ACTIVATED' | 'CLAIMED' | 'USED' | 'REVOKED' | string;
  createdAt: string;
  activatedAt?: string | null;
  usedAt?: string | null;
  revokedAt?: string | null;
  createdBy?: string;
  note?: string;
  rawToken: string;
  url: string;
  isWinner?: boolean;
  boundClientId?: string | null;
  customerId?: string;
  customerName?: string;
  purchaseNumber?: number;
}

export interface CustomerGroupSummary {
  customerId: string;
  customerName: string;
  totalPurchases: number;
  unusedCount: number;
  activatedCount: number;
  claimedCount: number;
  usedCount: number;
  revokedCount: number;
  latestCreatedAt: string;
  links: AdminCustomerLink[];
}

export interface AdminLinksResponse {
  success: boolean;
  links: AdminCustomerLink[];
  customers?: CustomerGroupSummary[];
  totalCount: number;
  page: number;
  totalPages: number;
  limit: number;
  stats: {
    total: number;
    unused: number;
    activated?: number;
    claimed?: number;
    used: number;
    revoked: number;
    totalCustomers?: number;
  };
}

