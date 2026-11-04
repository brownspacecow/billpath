/**
 * Field mapping between Congress.gov API response and BillPath's internal schema.
 *
 * Congress.gov fields -> BillPath schema fields:
 * - bill.type               -> billType (e.g., "HR")
 * - bill.number             -> number (e.g., "H.R. 1")
 * - bill.title              -> title
 * - bill.originChamber      -> chamber ("House" | "Senate")
 * - bill.congress           -> session / Congress
 * - bill.sponsors[0]        -> sponsor (primary sponsor)
 * - bill.sponsors[1..]      -> cosponsors (via separate API call)
 * - bill.summary.text       -> summary
 * - bill.latestAction       -> currentStage (mapped to BillStage enum)
 * - bill.committees (dict)  -> committees (fetched separately from /committees endpoint)
 * - bill.actions            -> actions/timeline events
 * - bill.votes              -> votes
 * - bill.amendments         -> amendments
 * - bill.introducedDate     -> key date
 * - bill.updateDate         -> updatedDate
 * - bill.url                -> sourceUrl
 */

export const BILL_STAGES = [
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

/**
 * Map Congress.gov latestAction text to a BillStage.
 * Uses keyword matching since Congress.gov doesn't use a fixed enum.
 */
export function mapStage(actionText) {
  const text = (actionText || '').toLowerCase();

  // Executive actions
  if (text.includes('signed') || text.includes('became public law') || text.includes('signed by the president'))
    return 'Signed Into Law';
  if (text.includes('vetoed') || text.includes('veto'))
    return 'Vetoed';

  // Second chamber / cross-chamber
  if (text.includes('passed senate') || text.includes('passed house'))
    return text.includes('passed senate') ? 'Second Chamber' : 'Passed Chamber';

  // Floor votes and debate
  if (text.includes('passed') && text.includes('house')) return 'Passed Chamber';
  if (text.includes('passed') && text.includes('senate')) return 'Passed Chamber';
  if (text.includes('vote') || text.includes('rollcall') || text.includes('roll call'))
    return 'Floor Vote';
  if (text.includes('debate')) return 'Floor Debate';

  // Committee stages
  if (text.includes('committee') && (text.includes('report') || text.includes('favorably')))
    return 'Committee Vote';
  if (text.includes('committee') && text.includes('hearing'))
    return 'Public Hearing';
  if (text.includes('committee') && (text.includes('referred') || text.includes('assigned')))
    return 'Committee Assignment';
  if (text.includes('committee'))
    return 'Committee Review';

  // Introduction
  if (text.includes('introduced') || text.includes('referred to the committee'))
    return 'Introduced';

  // Default to Committee Review for unknown
  return 'Committee Review';
}

/**
 * Extract bill number in a clean format from Congress.gov.
 */
export function formatBillNumber(bill) {
  const type = (bill.type || bill.billType || '').toUpperCase();
  const number = bill.number || '';
  return `${type} ${number}`;
}

/**
 * Generate a stable bill ID for BillPath.
 */
export function generateBillId(bill) {
  const type = (bill.type || bill.billType || '').toLowerCase();
  const number = String(bill.number || '').replace(/^0+/, '');
  const congress = bill.congress || '';
  return `${type}-${congress}-${number}`.toLowerCase();
}

/**
 * Map a Congress.gov bill object to BillPath's Bill interface.
 * @param {Object} congressBill - Raw bill from Congress.gov API
 * @param {Object} options - Additional options
 * @returns {Object} BillPath-compatible bill object
 */
export function mapBillToBillPath(congressBill, options = {}) {
  const {
    cosponsors = [],
    actions = [],
    committees = [],
    retrievedAt = new Date().toISOString(),
  } = options;

  const billType = congressBill.type || congressBill.billType || '';
  const chamber = (congressBill.originChamber || congressBill.originatingChamber || 'unknown').toLowerCase();
  const congressNum = congressBill.congress || 0;
  const latestAction = congressBill.latestAction || {};
  const stage = mapStage(latestAction.text || '');

  const id = generateBillId(congressBill);
  const number = formatBillNumber(congressBill);

  // Extract sponsor
  const sponsor = congressBill.sponsors && congressBill.sponsors[0]
    ? [congressBill.sponsors[0].title, congressBill.sponsors[0].firstName, congressBill.sponsors[0].lastName].filter(Boolean).join(' ')
    : 'Unknown';

  // Extract summary
  const summary = congressBill.summary
    ? congressBill.summary.text || congressBill.summary.summary || ''
    : '';

  // Extract key dates
  const introducedDate = congressBill.introducedDate || '';
  const updatedDate = congressBill.updateDate || congressBill.updatedDate || '';

  // Build committee list from separately fetched committees
  const committeeNames = (committees || [])
    .map((c) => c.name || c.systemCode || 'Unknown Committee')
    .slice(0, 3);

  // Build actions from latest action
  const actionDate = latestAction.actionDate || '';

  // Calculate progress based on stage
  const stageIndex = BILL_STAGES.indexOf(stage);
  const progress = stageIndex >= 0 ? Math.round(((stageIndex + 1) / BILL_STAGES.length) * 100) : 10;

  // Days active (approximate from introduced date)
  let daysActive = 0;
  if (introducedDate) {
    const introduced = new Date(introducedDate);
    const now = new Date();
    daysActive = Math.floor((now - introduced) / (1000 * 60 * 60 * 24));
  }

  // Last activity days ago
  let lastActivityDaysAgo = 0;
  if (actionDate) {
    const action = new Date(actionDate);
    const now = new Date();
    lastActivityDaysAgo = Math.floor((now - action) / (1000 * 60 * 60 * 24));
  }

  const nextStage = stageIndex >= 0 && stageIndex < BILL_STAGES.length - 1
    ? BILL_STAGES[stageIndex + 1]
    : null;

  // Build state/jurisdiction from chamber
  const state = 'US';

  return {
    id,
    number,
    title: congressBill.title || 'Untitled Bill',
    state,
    chamber,
    congress: congressNum,
    sponsor,
    cosponsors: cosponsors.map((c) => ({
      id: c.bioguideId || `cosp-${c.lastName}`,
      name: [c.title, c.firstName, c.lastName].filter(Boolean).join(' '),
      party: c.party || '',
      state: c.state || '',
    })),
    committee: committeeNames[0] || 'Unassigned',
    committees: committeeNames,
    topic: classifyTopic(congressBill.title || '', summary),
    currentStage: stage,
    nextStage,
    progress,
    lastActivityDaysAgo: Math.max(0, lastActivityDaysAgo),
    daysActive: Math.max(0, daysActive),
    totalMovements: actions.length || 1,
    summary,
    source: 'congress.gov',
    sourceUrl: congressBill.url || `https://www.congress.gov/bill/${congressNum}-congress/${chamber}-bill/${number.replace(/\s+/g, '-').toLowerCase()}`,
    retrievedAt,
    // Key dates
    introducedDate,
    updatedDate,
    latestAction: latestAction.text || '',
    latestActionDate: actionDate,
    // Raw references for traceability
    congress: congressNum,
    billType: billType,
    billNumber: congressBill.number,
    originatingChamber: chamber,
  };
}

/**
 * Classify bill topic based on title and summary keywords.
 */
function classifyTopic(title, summary) {
  const text = `${title} ${summary}`.toLowerCase();
  const topics = [
    ['energy', 'Energy'],
    ['climate', 'Energy'],
    ['renewable', 'Energy'],
    ['oil', 'Energy'],
    ['gas', 'Energy'],
    ['water', 'Water'],
    ['drought', 'Water'],
    ['aquifer', 'Water'],
    ['school', 'Education'],
    ['education', 'Education'],
    ['student', 'Education'],
    ['teacher', 'Education'],
    ['curriculum', 'Education'],
    ['health', 'Health'],
    ['medical', 'Health'],
    ['hospital', 'Health'],
    ['telehealth', 'Health'],
    ['behavioral', 'Health'],
    ['mental health', 'Health'],
    ['transit', 'Transportation'],
    ['transportation', 'Transportation'],
    ['highway', 'Transportation'],
    ['rail', 'Transportation'],
    ['airport', 'Transportation'],
    ['appropriations', 'Appropriations'],
    ['budget', 'Appropriations'],
    ['funding', 'Appropriations'],
    ['bond', 'Appropriations'],
    ['finance', 'Appropriations'],
    ['tax', 'Appropriations'],
    ['revenue', 'Appropriations'],
    ['justice', 'Judiciary'],
    ['crime', 'Judiciary'],
    ['court', 'Judiciary'],
    ['legal', 'Judiciary'],
    ['immigration', 'Judiciary'],
    ['border', 'Judiciary'],
    ['defense', 'Armed Services'],
    ['military', 'Armed Services'],
    ['veteran', 'Armed Services'],
    ['army', 'Armed Services'],
    ['navy', 'Armed Services'],
    ['air force', 'Armed Services'],
  ];

  for (const [keyword, topic] of topics) {
    if (text.includes(keyword)) return topic;
  }

  return 'General';
}

/**
 * Map Congress.gov actions to BillPath timeline events.
 */
export function mapTimelineEvents(actions, billStage) {
  const events = [];

  for (const action of actions || []) {
    const stage = mapStage(action.text || '');
    const date = action.actionDate || '';
    const status = determineStatus(action, billStage, stage);

    events.push({
      date,
      stage,
      label: action.text || 'Action',
      status,
      actor: action.actingBy || '',
      location: action.location || '',
    });
  }

  // Sort by date
  events.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(a.date) - new Date(b.date);
  });

  return events;
}

/**
 * Determine timeline event status.
 */
function determineStatus(action, billStage, eventStage) {
  // Find position in stage flow
  const billIndex = BILL_STAGES.indexOf(billStage);
  const eventIndex = BILL_STAGES.indexOf(eventStage);

  if (billIndex < 0 || eventIndex < 0) return 'upcoming';

  if (eventIndex < billIndex) return 'complete';
  if (eventIndex === billIndex) return 'current';
  return 'upcoming';
}

/**
 * Map Congress.gov votes to BillPath vote records.
 */
export function mapVotes(votes, billId) {
  return (votes || []).map((vote, index) => ({
    id: vote.voteId || `vote-${billId}-${index}`,
    billId,
    beforeStage: mapStage(vote.beforeStage || 'Floor Vote'),
    afterStage: mapStage(vote.afterStage || 'Passed Chamber'),
    result: vote.result?.toLowerCase() === 'pass' ? 'pass' : 'fail',
    yes: vote.yes || 0,
    no: vote.no || 0,
    abstain: vote.abstain || 0,
    date: vote.voteDate || '',
    source: 'congress.gov',
    sourceUrl: vote.url || '',
    retrievedAt: new Date().toISOString(),
  }));
}

/**
 * Map Congress.gov amendments to BillPath amendment records.
 */
export function mapAmendments(amendments, billId) {
  return (amendments || []).map((amendment, index) => ({
    id: amendment.amendmentNumber || `amendment-${billId}-${index}`,
    billId,
    number: amendment.amendmentNumber || '',
    title: amendment.title || '',
    sponsor: amendment.sponsor ? `${amendment.sponsor.title} ${amendment.sponsor.firstName} ${amendment.sponsor.lastName}`.trim() : '',
    status: amendment.status || '',
    date: amendment.introducedDate || '',
    source: 'congress.gov',
    sourceUrl: amendment.url || '',
    retrievedAt: new Date().toISOString(),
  }));
}

/**
 * Map Congress.gov committees to BillPath committee records.
 */
export function mapCommittees(congressCommittees) {
  return (congressCommittees || []).map((c) => ({
    id: c.systemCode || c.name.toLowerCase().replace(/\s+/g, '-'),
    name: c.name || 'Unknown Committee',
    description: c.description || '',
    chamber: c.chamber || '',
    congress: c.congress || 0,
    leaders: c.leaders?.map((l) => `${l.title} ${l.firstName} ${l.lastName}`.trim()) || [],
    memberIds: c.members?.map((m) => m.bioguideId || '') || [],
    source: 'congress.gov',
    sourceUrl: c.url || '',
    retrievedAt: new Date().toISOString(),
  }));
}

/**
 * Map Congress.gov members to BillPath legislator records.
 */
export function mapLegislators(members) {
  return (members || []).map((m) => ({
    id: m.bioguideId || `member-${m.lastName}`,
    name: [m.title, m.firstName, m.lastName].filter(Boolean).join(' '),
    party: m.party || '',
    state: m.state || '',
    district: m.district || '',
    committees: m.committees?.map((c) => c.name || '') || [],
    sponsoredBillIds: [], // Will be populated during bill processing
    source: 'congress.gov',
    sourceUrl: m.url || '',
    retrievedAt: new Date().toISOString(),
  }));
}
