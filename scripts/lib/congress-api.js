/**
 * Congress.gov API client for fetching real legislative data.
 * Documentation: https://api.congress.gov/
 * Requires API key from https://api.data.gov/
 */

const BASE_URL = 'https://api.congress.gov/v3';

function getApiKey() {
  const key = process.env.CONGRESS_GOV_API_KEY;
  if (!key) {
    throw new Error(
      'CONGRESS_GOV_API_KEY environment variable is not set. ' +
      'Get a free API key at https://api.data.gov/'
    );
  }
  return key;
}

async function fetchCongress(endpoint, params = {}) {
  const apiKey = getApiKey();
  const url = new URL(`${BASE_URL}${endpoint}`);

  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }

  const response = await fetch(url.toString());

  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after') || 5;
    throw new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
  }

  if (!response.ok) {
    throw new Error(
      `Congress.gov API error: ${response.status} ${response.statusText} for ${url.pathname}`
    );
  }

  return response.json();
}

/**
 * Fetch a single bill by Congress, bill type, and bill number.
 * @param {number} congress - Congress number (e.g., 119)
 * @param {string} billType - 'hr', 's', etc.
 * @param {number|string} billNumber - Bill number
 */
async function fetchBill(congress, billType, billNumber) {
  const data = await fetchCongress(`/bill/${congress}/${billType}/${billNumber}`);
  return data.bill || data;
}

/**
 * Fetch bills for a given Congress with optional filters.
 * @param {number} congress - Congress number
 * @param {Object} filters - Optional filters (billType, limit, offset, etc.)
 */
async function fetchBills(congress, filters = {}) {
  const data = await fetchCongress(`/bill/${congress}`, {
    ...filters,
    limit: filters.limit !== undefined ? filters.limit : 250,
    offset: filters.offset !== undefined ? filters.offset : 0,
  });
  return data.bills || [];
}

/**
 * Fetch amendments for a bill.
 */
async function fetchAmendments(congress, billType, billNumber) {
  try {
    const data = await fetchCongress(
      `/bill/${congress}/${billType}/${billNumber}/amendments`
    );
    return data.amendments || [];
  } catch (e) {
    return [];
  }
}

/**
 * Fetch cosponsors for a bill.
 */
async function fetchCosponsors(congress, billType, billNumber) {
  try {
    const data = await fetchCongress(
      `/bill/${congress}/${billType}/${billNumber}/cosponsors`
    );
    return data.cosponsors || [];
  } catch (e) {
    return [];
  }
}

/**
 * Fetch actions for a bill.
 */
async function fetchActions(congress, billType, billNumber) {
  try {
    const data = await fetchCongress(
      `/bill/${congress}/${billType}/${billNumber}/actions`
    );
    return data.actions || [];
  } catch (e) {
    return [];
  }
}

/**
 * Fetch votes for a bill.
 * Note: Congress.gov uses separate house-vote and senate-vote endpoints.
 */
async function fetchVotes(congress, billType, billNumber) {
  try {
    const chamber = billType.toLowerCase().startsWith('s') ? 'senate' : 'house';
    const data = await fetchCongress(`/${chamber}-vote/${congress}`);
    // Filter votes for this specific bill
    return (data.votes || []).filter(
      (v) => v.bill?.billType === billType && String(v.bill.number) === String(billNumber)
    );
  } catch (e) {
    return [];
  }
}

/**
 * Fetch committee info for a given Congress.
 */
async function fetchCommittees(congress) {
  try {
    const data = await fetchCongress(`/committee/${congress}`);
    return data.committees || [];
  } catch (e) {
    return [];
  }
}

/**
 * Fetch committees associated with a specific bill.
 */
async function fetchBillCommittees(congress, billType, billNumber) {
  try {
    const data = await fetchCongress(
      `/bill/${congress}/${billType}/${billNumber}/committees`
    );
    return data.committees || [];
  } catch (e) {
    return [];
  }
}

/**
 * Fetch a legislator (member) by bioguide ID.
 */
async function fetchMember(bioguideId) {
  try {
    const data = await fetchCongress(`/member/${bioguideId}`);
    return data.member || data;
  } catch (e) {
    return null;
  }
}

export {
  fetchBill,
  fetchBills,
  fetchAmendments,
  fetchCosponsors,
  fetchActions,
  fetchVotes,
  fetchBillCommittees,
  fetchCommittees,
  fetchMember,
  getApiKey,
};
