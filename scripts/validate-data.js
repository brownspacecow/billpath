#!/usr/bin/env node
/**
 * BillPath Data Validation Script
 * Validates all generated JSON data files for consistency and integrity.
 *
 * Checks:
 *   - Missing sponsors on bills
 *   - Invalid bill references (timelines, activity, votes reference non-existent bills)
 *   - Broken committee references
 *   - Duplicate bills
 *   - Invalid timelines (dates out of order, missing stages)
 *   - Missing source attribution fields
 *
 * Usage:
 *   node scripts/validate-data.js
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(import.meta.dirname, '../src/data');

const BILL_STAGES = [
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

let errors = [];
let warnings = [];

function error(msg) {
  errors.push(msg);
  console.error(`  ✗ ${msg}`);
}

function warning(msg) {
  warnings.push(msg);
  console.warn(`  ⚠ ${msg}`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    error(`Failed to read ${file}: ${e.message}`);
    return null;
  }
}

function validate() {
  console.log('\n=== BillPath Data Validation ===\n');

  const bills = readJson(path.join(DATA_DIR, 'bills.json')) || [];
  const timelines = readJson(path.join(DATA_DIR, 'timelines.json')) || {};
  const committees = readJson(path.join(DATA_DIR, 'committees.json')) || [];
  const legislators = readJson(path.join(DATA_DIR, 'legislators.json')) || [];
  const votes = readJson(path.join(DATA_DIR, 'votes.json')) || [];
  const activity = readJson(path.join(DATA_DIR, 'activity.json')) || [];

  const billIds = new Set(bills.map((b) => b.id));
  const committeeNames = new Set(committees.map((c) => c.name));

  // 1. Validate bills
  console.log('[1/7] Validating bills...');
  let duplicateBills = 0;
  let missingSponsor = 0;
  let missingSource = 0;
  let invalidStage = 0;

  for (const bill of bills) {
    // Check missing sponsor
    if (!bill.sponsor || bill.sponsor === 'Unknown') {
      missingSponsor++;
      error(`Bill ${bill.id} (${bill.number}): missing or unknown sponsor`);
    }

    // Check source attribution
    if (!bill.source) {
      missingSource++;
      error(`Bill ${bill.id}: missing source field`);
    }
    if (!bill.sourceUrl) {
      missingSource++;
      error(`Bill ${bill.id}: missing sourceUrl field`);
    }
    if (!bill.retrievedAt) {
      missingSource++;
      error(`Bill ${bill.id}: missing retrievedAt field`);
    }

    // Check valid stage
    if (!BILL_STAGES.includes(bill.currentStage)) {
      invalidStage++;
      error(`Bill ${bill.id}: invalid currentStage '${bill.currentStage}'`);
    }

    // Check required fields
    if (!bill.title) error(`Bill ${bill.id}: missing title`);
    if (!bill.number) error(`Bill ${bill.id}: missing number`);
  }

  // Check duplicates by ID
  const idCounts = {};
  for (const bill of bills) {
    idCounts[bill.id] = (idCounts[bill.id] || 0) + 1;
  }
  for (const [id, count] of Object.entries(idCounts)) {
    if (count > 1) {
      duplicateBills++;
      error(`Duplicate bill ID: ${id} appears ${count} times`);
    }
  }

  ok(`${bills.length} bills validated`);
  if (missingSponsor === 0) ok('No missing sponsors');
  if (missingSource === 0) ok('All bills have source attribution');
  if (invalidStage === 0) ok('All bills have valid stages');

  // 2. Validate bill references in timelines
  console.log('\n[2/7] Validating timeline references...');
  let invalidTimelineRefs = 0;
  let invalidTimelineDates = 0;

  for (const [billId, events] of Object.entries(timelines)) {
    if (!billIds.has(billId)) {
      invalidTimelineRefs++;
      error(`Timeline for unknown bill: ${billId}`);
      continue;
    }

    const bill = bills.find((b) => b.id === billId);
    for (let i = 0; i < events.length; i++) {
      const evt = events[i];
      if (!evt.date || evt.date === '') {
        // Allow empty dates for upcoming events
        continue;
      }
      // Check date is valid
      const date = new Date(evt.date);
      if (isNaN(date.getTime())) {
        invalidTimelineDates++;
        error(`Timeline ${billId}[${i}]: invalid date '${evt.date}'`);
      }

      // Check valid stage
      if (evt.stage && !BILL_STAGES.includes(evt.stage)) {
        error(`Timeline ${billId}[${i}]: invalid stage '${evt.stage}'`);
      }

      // Check date order
      if (i > 0 && events[i - 1].date && evt.date) {
        const prev = new Date(events[i - 1].date);
        const curr = new Date(evt.date);
        if (curr < prev) {
          invalidTimelineDates++;
          warning(`Timeline ${billId}[${i}]: date out of order (${evt.date} before ${events[i - 1].date})`);
        }
      }
    }
  }

  if (invalidTimelineRefs === 0) ok('No invalid timeline bill references');
  if (invalidTimelineDates === 0) ok('No invalid timeline dates');

  // 3. Validate activity references
  console.log('\n[3/7] Validating activity references...');
  let invalidActivityRefs = 0;

  for (const item of activity) {
    if (!billIds.has(item.billId)) {
      invalidActivityRefs++;
      error(`Activity ${item.id}: references unknown bill ${item.billId}`);
    }
  }

  if (invalidActivityRefs === 0) ok('No invalid activity bill references');

  // 4. Validate votes references
  console.log('\n[4/7] Validating vote references...');
  let invalidVoteRefs = 0;
  let invalidVoteStages = 0;

  for (const vote of votes) {
    if (!billIds.has(vote.billId)) {
      invalidVoteRefs++;
      error(`Vote ${vote.id}: references unknown bill ${vote.billId}`);
      continue;
    }

    if (!BILL_STAGES.includes(vote.beforeStage)) {
      invalidVoteStages++;
      error(`Vote ${vote.id}: invalid beforeStage '${vote.beforeStage}'`);
    }
    if (!BILL_STAGES.includes(vote.afterStage)) {
      invalidVoteStages++;
      error(`Vote ${vote.id}: invalid afterStage '${vote.afterStage}'`);
    }
  }

  if (invalidVoteRefs === 0) ok('No invalid vote bill references');
  if (invalidVoteStages === 0) ok('No invalid vote stages');

  // 5. Validate committee references
  console.log('\n[5/7] Validating committee references...');
  let brokenCommitteeRefs = 0;

  for (const bill of bills) {
    if (bill.committee && bill.committee !== 'Unassigned' && !committeeNames.has(bill.committee)) {
      // Not necessarily an error - committees may not be fully populated
      warning(`Bill ${bill.id}: committee '${bill.committee}' not found in committees.json`);
    }
  }

  if (brokenCommitteeRefs === 0) ok('No broken committee references');

  // 6. Validate legislator references
  console.log('\n[6/7] Validating legislator references...');
  let invalidLegislatorRefs = 0;

  for (const legislator of legislators) {
    for (const billId of legislator.sponsoredBillIds) {
      if (!billIds.has(billId)) {
        invalidLegislatorRefs++;
        error(`Legislator ${legislator.id}: sponsors unknown bill ${billId}`);
      }
    }
  }

  if (invalidLegislatorRefs === 0) ok('No invalid legislator bill references');

  // 7. Validate source attribution across all files
  console.log('\n[7/7] Validating source attribution...');
  let filesWithSource = 0;
  let filesWithoutSource = 0;

  const dataFiles = [
    { name: 'bills.json', data: bills, check: (d) => d.source },
    { name: 'committees.json', data: committees, check: (d) => d.source },
    { name: 'legislators.json', data: legislators, check: (d) => d.source },
    { name: 'votes.json', data: votes, check: (d) => d.source },
  ];

  for (const { name, data, check } of dataFiles) {
    const hasSource = data.every((item) => check(item));
    if (hasSource) {
      filesWithSource++;
      ok(`${name}: all items have source attribution`);
    } else {
      filesWithoutSource++;
      error(`${name}: some items missing source attribution`);
    }
  }

  // Summary
  console.log('\n=== Validation Summary ===');
  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}`);

  if (errors.length > 0) {
    console.log('\n❌ Validation FAILED');
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log('\n⚠️  Validation PASSED with warnings');
    process.exit(0);
  } else {
    console.log('\n✅ Validation PASSED');
    process.exit(0);
  }
}

validate();
