import type { Bill, BillStage } from './models';

export const STAGES: BillStage[] = [
  'Introduced',
  'Committee Assignment',
  'Committee Review',
  'Public Hearing',
  'Committee Vote',
  'Floor Debate',
  'Floor Vote',
  'Passed Chamber',
  'Second Chamber',
  'Executive Review',
  'Signed Into Law',
  'Vetoed'
];

export function stageCounts(bills: Bill[]) {
  return STAGES.map((stage) => ({ stage, count: bills.filter((b) => b.currentStage === stage).length }));
}

export function likelyNextStep(stage: BillStage) {
  const index = STAGES.indexOf(stage);
  if (index < 0 || index >= STAGES.length - 2) return 'Final disposition reached or pending executive action.';
  return `Bills currently in ${stage} usually move to ${STAGES[index + 1]} after required review.`;
}
