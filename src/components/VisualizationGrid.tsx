import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';

const COLORS = ['#1D4ED8', '#22C55E', '#F59E0B', '#EF4444', '#64748B'];

export default function VisualizationGrid({ stageData }: { stageData: { stage: string; count: number }[] }) {
  const movement = [
    { day: 'Mon', moves: 8 },
    { day: 'Tue', moves: 13 },
    { day: 'Wed', moves: 10 },
    { day: 'Thu', moves: 16 },
    { day: 'Fri', moves: 9 }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card h-72">
        <h3 className="font-semibold">Bill Stage Distribution</h3>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={stageData} dataKey="count" nameKey="stage" outerRadius={90}>
              {stageData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="card h-72">
        <h3 className="font-semibold">Movement Over Time</h3>
        <ResponsiveContainer>
          <LineChart data={movement}>
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="moves" stroke="#22C55E" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
