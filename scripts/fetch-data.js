#!/usr/bin/env node
/**
 * BillPath Data Ingestion Script
 * Fetches real legislative data from Congress.gov API and generates all
 * JSON data files needed by the BillPath frontend.
 *
 * Usage:
 *   CONGRESS_GOV_API_KEY=your-key node scripts/fetch-data.js
 *
 * This script:
 * 1. Fetches bills from Congress.gov API
 * 2. Maps them to BillPath's schema
 * 3. Generates all data JSON files
 * 4. Preserves backward compatibility with existing frontend
 */

import fs from 'fs';
import path from 'path';
import {
  fetchBill,
  fetchBills,
  fetchAmendments,
  fetchCosponsors,
  fetchActions,
  fetchVotes,
  fetchBillCommittees,
} from './lib/congress-api.js';
import {
  mapBillToBillPath,
  mapTimelineEvents,
  mapVotes,
  mapAmendments,
  BILL_STAGES,
} from './lib/mapping.js';

const DATA_DIR = path.resolve(import.meta.dirname, '../src/data');
const DEFAULT_CONGRESS = 119;
const MAX_BILLS_PER_RUN = 10; // Respect rate limits
const REQUEST_DELAY_MS = 1000; // 1 second between requests

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`  Wrote ${file} (${Array.isArray(data) ? data.length : Object.keys(data).length} items)`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main ingestion function.
 */
async function ingest() {
  const congress = DEFAULT_CONGRESS;
  const retrievedAt = new Date().toISOString();

  console.log(`\n=== BillPath Data Ingestion ===\n`);
  console.log(`Congress: ${congress}`);
  console.log(`Retrieved at: ${retrievedAt}\n`);

  // Step 1: Fetch bills
  console.log(`[1/7] Fetching bills from Congress.gov...`);
  let bills;
  try {
    bills = await fetchBills(congress, { limit: MAX_BILLS_PER_RUN });
    console.log(`  Found ${bills.length} bills`);
  } catch (err) {
    console.error(`  Failed to fetch bills: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Enrich each bill with details
  console.log(`\n[2/7] Enriching bill details (cosponsors, actions, votes, amendments)...`);
  const enrichedBills = [];
  const allActions = [];
  const allVotes = [];
  const allAmendments = [];
  const allLegislators = new Map();
  const allCommittees = new Map();

  for (let i = 0; i < bills.length; i++) {
    const rawBill = bills[i];
    const billType = (rawBill.type || rawBill.billType || 'hr').toLowerCase();
    const billNumber = rawBill.number;

    console.log(`  [${i + 1}/${bills.length}] Processing ${rawBill.type || rawBill.billType} ${billNumber}...`);

    try {
      // Fetch full bill details
      const fullBill = await fetchBill(congress, billType, billNumber);
      await sleep(REQUEST_DELAY_MS);

      // Fetch cosponsors
      const cosponsors = await fetchCosponsors(congress, billType, billNumber);
      await sleep(REQUEST_DELAY_MS);

      // Fetch actions
      const actions = await fetchActions(congress, billType, billNumber);
      await sleep(REQUEST_DELAY_MS);

      // Fetch votes
      const votes = await fetchVotes(congress, billType, billNumber);
      await sleep(REQUEST_DELAY_MS);

      // Fetch amendments
      const amendments = await fetchAmendments(congress, billType, billNumber);
      await sleep(REQUEST_DELAY_MS);

      // Fetch committees from separate endpoint
      const billCommittees = await fetchBillCommittees(congress, billType, billNumber);
      await sleep(REQUEST_DELAY_MS);

      // Map to BillPath schema
      const mappedBill = mapBillToBillPath(fullBill, {
        cosponsors,
        actions,
        committees: billCommittees,
        retrievedAt,
      });

      enrichedBills.push(mappedBill);

      // Collect timeline events
      const timelineEvents = mapTimelineEvents(actions, mappedBill.currentStage);
      allActions.push(...timelineEvents.map((evt, idx) => ({
        id: `action-${mappedBill.id}-${idx}`,
        billId: mappedBill.id,
        billNumber: mappedBill.number,
        text: evt.label,
        stage: evt.stage,
        timestamp: evt.date || retrievedAt,
        actor: evt.actor || '',
        location: evt.location || '',
      })));

      // Collect votes
      const mappedVotes = mapVotes(votes, mappedBill.id);
      allVotes.push(...mappedVotes);

      // Collect amendments
      const mappedAmendments = mapAmendments(amendments, mappedBill.id);
      allAmendments.push(...mappedAmendments);

      // Collect legislators (sponsor + cosponsors)
      const sponsor = fullBill.sponsors?.[0];
      if (sponsor && sponsor.bioguideId) {
        if (!allLegislators.has(sponsor.bioguideId)) {
          allLegislators.set(sponsor.bioguideId, {
            id: sponsor.bioguideId,
            name: [sponsor.title, sponsor.firstName, sponsor.lastName].filter(Boolean).join(' '),
            party: sponsor.party || '',
            state: sponsor.state || '',
            district: sponsor.district || '',
            committees: [],
            sponsoredBillIds: [],
            source: 'congress.gov',
            sourceUrl: sponsor.url || '',
            retrievedAt,
          });
        }
        allLegislators.get(sponsor.bioguideId).sponsoredBillIds.push(mappedBill.id);
      }

      for (const cosponsor of cosponsors) {
        if (cosponsor.bioguideId) {
          if (!allLegislators.has(cosponsor.bioguideId)) {
            allLegislators.set(cosponsor.bioguideId, {
              id: cosponsor.bioguideId,
              name: [cosponsor.title, cosponsor.firstName, cosponsor.lastName].filter(Boolean).join(' '),
              party: cosponsor.party || '',
              state: cosponsor.state || '',
              district: cosponsor.district || '',
              committees: [],
              sponsoredBillIds: [],
              source: 'congress.gov',
              sourceUrl: cosponsor.url || '',
              retrievedAt,
            });
          }
        }
      }

      // Collect committees
      for (const committee of billCommittees) {
        if (!allCommittees.has(committee.systemCode || committee.name)) {
          allCommittees.set(committee.systemCode || committee.name, {
            id: committee.systemCode || committee.name.toLowerCase().replace(/\s+/g, '-'),
            name: committee.name || 'Unknown Committee',
            description: committee.description || '',
            chamber: committee.chamber || (rawBill.originChamber || '').toLowerCase(),
            congress: congress,
            leaders: [],
            memberIds: [],
            source: 'congress.gov',
            sourceUrl: committee.url || '',
            retrievedAt,
          });
        }
      }
    } catch (err) {
      console.error(`    Error processing ${rawBill.type || rawBill.billType} ${billNumber}: ${err.message}`);
      continue;
    }
  }

  console.log(`  Enriched ${enrichedBills.length} bills successfully`);

  // Step 3: Generate bills.json
  console.log(`\n[3/7] Generating bills.json...`);
  const billsOutput = enrichedBills.map((b) => ({
    id: b.id,
    number: b.number,
    title: b.title,
    state: b.state,
    chamber: b.chamber,
    congress: b.congress,
    sponsor: b.sponsor,
    committee: b.committee,
    committees: b.committees,
    topic: b.topic,
    currentStage: b.currentStage,
    nextStage: b.nextStage,
    progress: b.progress,
    lastActivityDaysAgo: b.lastActivityDaysAgo,
    daysActive: b.daysActive,
    totalMovements: b.totalMovements,
    aiSummary: b.summary || `No summary available from source. ${b.title}`,
    summary: b.summary,
    source: b.source,
    sourceUrl: b.sourceUrl,
    retrievedAt: b.retrievedAt,
    introducedDate: b.introducedDate,
    updatedDate: b.updatedDate,
    latestAction: b.latestAction,
    latestActionDate: b.latestActionDate,
    cosponsors: b.cosponsors,
    billType: b.billType,
    billNumber: b.billNumber,
    originatingChamber: b.originatingChamber,
  }));
  writeJson(path.join(DATA_DIR, 'bills.json'), billsOutput);

  // Step 4: Generate timelines.json
  console.log(`\n[4/7] Generating timelines.json...`);
  const timelinesOutput = {};
  const billsById = new Map(enrichedBills.map((b) => [b.id, b]));

  // Group actions by bill
  const billActions = new Map();
  for (const action of allActions) {
    if (!billActions.has(action.billId)) billActions.set(action.billId, []);
    billActions.get(action.billId).push(action);
  }

  for (const [billId, actions] of billActions) {
    const bill = billsById.get(billId);
    const stage = bill ? bill.currentStage : 'Committee Review';
    timelinesOutput[billId] = actions.map((a, idx) => ({
      date: a.timestamp,
      stage: a.stage,
      label: a.text,
      status: determineTimelineStatus(a.stage, stage),
    }));
  }

  writeJson(path.join(DATA_DIR, 'timelines.json'), timelinesOutput);

  // Step 5: Generate committees.json
  console.log(`\n[5/7] Generating committees.json...`);
  const committeesOutput = Array.from(allCommittees.values()).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    chamber: c.chamber,
    congress: c.congress,
    leaders: c.leaders,
    memberIds: c.memberIds,
    source: c.source,
    sourceUrl: c.sourceUrl,
    retrievedAt: c.retrievedAt,
  }));
  writeJson(path.join(DATA_DIR, 'committees.json'), committeesOutput);

  // Step 6: Generate legislators.json
  console.log(`\n[6/7] Generating legislators.json...`);
  const legislatorsOutput = Array.from(allLegislators.values()).map((l) => ({
    id: l.id,
    name: l.name,
    party: l.party,
    state: l.state,
    district: l.district,
    committees: l.committees,
    sponsoredBillIds: l.sponsoredBillIds,
    source: l.source,
    sourceUrl: l.sourceUrl,
    retrievedAt: l.retrievedAt,
  }));
  writeJson(path.join(DATA_DIR, 'legislators.json'), legislatorsOutput);

  // Step 7: Generate votes.json and activity.json
  console.log(`\n[7/7] Generating votes.json and activity.json...`);

  // votes.json - only keep votes with valid bill references
  const validBillIds = new Set(enrichedBills.map((b) => b.id));
  const validVotes = allVotes.filter((v) => validBillIds.has(v.billId));
  const votesOutput = validVotes.map((v) => ({
    id: v.id,
    billId: v.billId,
    beforeStage: v.beforeStage,
    afterStage: v.afterStage,
    result: v.result,
    yes: v.yes,
    no: v.no,
    abstain: v.abstain,
    date: v.date,
    source: v.source,
    sourceUrl: v.sourceUrl,
    retrievedAt: v.retrievedAt,
  }));
  writeJson(path.join(DATA_DIR, 'votes.json'), votesOutput);

  // activity.json - recent activity feed
  const recentActions = allActions
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 50);
  const activityOutput = recentActions.map((a, idx) => ({
    id: a.id,
    billId: a.billId,
    billNumber: a.billNumber,
    text: a.text,
    stage: a.stage,
    timestamp: a.timestamp,
  }));
  writeJson(path.join(DATA_DIR, 'activity.json'), activityOutput);

  // Generate briefings.json from bills data (daily summary)
  console.log(`\n[8/8] Generating briefings.json...`);
  const today = new Date().toISOString().split('T')[0];
  const stageCounts = {};
  for (const stage of BILL_STAGES) {
    stageCounts[stage] = enrichedBills.filter((b) => b.currentStage === stage).length;
  }
  const briefingsOutput = [
    {
      date: today,
      introduced: stageCounts['Introduced'] || 0,
      enteredCommittee: stageCounts['Committee Assignment'] || 0,
      hearings: stageCounts['Public Hearing'] || 0,
      passedChamber: stageCounts['Passed Chamber'] || 0,
      signed: stageCounts['Signed Into Law'] || 0,
      mostActiveCommittee:
        committeesOutput.length > 0
          ? committeesOutput[0].name
          : 'No committees',
      mostFollowedBill:
        enrichedBills.length > 0 ? enrichedBills[0].number : 'None',
      source: 'congress.gov',
      retrievedAt,
    },
  ];
  writeJson(path.join(DATA_DIR, 'briefings.json'), briefingsOutput);

  console.log(`\n=== Ingestion Complete ===\n`);
  console.log(`Generated files in ${DATA_DIR}:`);
  console.log(`  - bills.json: ${billsOutput.length} bills`);
  console.log(`  - timelines.json: ${Object.keys(timelinesOutput).length} bill timelines`);
  console.log(`  - committees.json: ${committeesOutput.length} committees`);
  console.log(`  - legislators.json: ${legislatorsOutput.length} legislators`);
  console.log(`  - votes.json: ${votesOutput.length} votes`);
  console.log(`  - activity.json: ${activityOutput.length} activity items`);
  console.log(`  - briefings.json: ${briefingsOutput.length} briefings`);
  console.log(`\nAll bills are sourced from congress.gov and traceable to the API.`);
}

/**
 * Determine timeline event status.
 */
function determineTimelineStatus(eventStage, billStage) {
  const billIndex = BILL_STAGES.indexOf(billStage);
  const eventIndex = BILL_STAGES.indexOf(eventStage);

  if (billIndex < 0 || eventIndex < 0) return 'upcoming';
  if (eventIndex < billIndex) return 'complete';
  if (eventIndex === billIndex) return 'current';
  return 'upcoming';
}

// Run ingestion
ingest().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
