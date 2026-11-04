import { useMemo, useState } from 'react';
import Fuse from 'fuse.js';

interface Item { id: string; number: string; title: string; sponsor: string; state: string; committee: string; topic: string; }

export default function SearchBox({ bills }: { bills: Item[] }) {
  const [query, setQuery] = useState('');
  const fuse = useMemo(() => new Fuse(bills, {
    keys: ['number', 'title', 'sponsor', 'state', 'committee', 'topic'],
    threshold: 0.35,
    includeScore: true
  }), [bills]);
  const results = query ? fuse.search(query).slice(0, 8).map((r) => r.item) : bills.slice(0, 5);

  return (
    <div className="card">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by bill number, keyword, sponsor, state, committee, topic"
        className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      <ul className="mt-3 space-y-2">
        {results.map((bill) => (
          <li key={bill.id}>
            <a href={`/billpath/bills/${bill.id}`} className="block rounded p-2 hover:bg-slate-100 dark:hover:bg-slate-700">
              <span className="font-semibold">{bill.number}</span> — {bill.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
