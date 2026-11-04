export type BillStage =
  | 'Introduced'
  | 'Committee Assignment'
  | 'Committee Review'
  | 'Public Hearing'
  | 'Committee Vote'
  | 'Floor Debate'
  | 'Floor Vote'
  | 'Passed Chamber'
  | 'Second Chamber'
  | 'Executive Review'
  | 'Signed Into Law'
  | 'Vetoed';

export interface BillTimelineEvent {
  date: string;
  stage: BillStage;
  label: string;
  status: 'complete' | 'current' | 'upcoming';
}

export interface BillMovement {
  billId: string;
  timestamp: string;
  fromStage?: BillStage;
  toStage: BillStage;
  detail: string;
}

export interface VoteRecord {
  id: string;
  billId: string;
  beforeStage: BillStage;
  afterStage: BillStage;
  result: 'pass' | 'fail';
  yes: number;
  no: number;
  abstain: number;
  date: string;
}

export interface Bill {
  id: string;
  number: string;
  title: string;
  state: string;
  sponsor: string;
  committee: string;
  topic: string;
  currentStage: BillStage;
  nextStage: BillStage | null;
  progress: number;
  lastActivityDaysAgo: number;
  daysActive: number;
  totalMovements: number;
  aiSummary: string;
}

export interface Legislator {
  id: string;
  name: string;
  party: string;
  state: string;
  district: string;
  committees: string[];
  sponsoredBillIds: string[];
}

export interface Committee {
  id: string;
  name: string;
  description: string;
  leaders: string[];
  memberIds: string[];
}

export interface ActivityItem {
  id: string;
  billId: string;
  billNumber: string;
  text: string;
  stage: BillStage;
  timestamp: string;
}

export interface DailyBriefing {
  date: string;
  introduced: number;
  enteredCommittee: number;
  hearings: number;
  passedChamber: number;
  signed: number;
  mostActiveCommittee: string;
  mostFollowedBill: string;
}

export interface FollowedItem {
  billId: string;
  followedAt: string;
}
