import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Fixed fruit list and colors (keeps total line as the main overall series)
const FRUITS = ['banana', 'apple', 'strawberry', 'orange'];
const FRUIT_COLORS = {
  banana: '#f59e0b',    // amber
  apple: '#10b981',     // green
  strawberry: '#ef4444',// red
  orange: '#fb923c'     // orange
};
const TOTAL_COLOR = '#374151';
const FRUIT_EMOJI = {
  banana: '🍌',
  apple: '🍎',
  strawberry: '🍓',
  orange: '🍊'
};

const SpoilageDashboard = () => {
  const [timeSeriesData, setTimeSeriesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalWeeks, setTotalWeeks] = useState(0);
  // which fruits are currently visible on the chart
  const [selectedFruits, setSelectedFruits] = useState(() => {
    const map = {};
    FRUITS.forEach(f => { map[f] = true; });
    return map;
  });
  // summary stats for each fruit (overall across all weeks)
  const [fruitSummary, setFruitSummary] = useState({});

  const API_BASE = "http://freshvision-940640548.us-east-1.elb.amazonaws.com/freshvision";

  useEffect(() => {
    fetchTimeSeriesData();
  }, []);

  const fetchTimeSeriesData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/time_series_spoilage`);

      if (!response.ok) {
        throw new Error('Failed to fetch time series data');
      }

      const data = await response.json();
      setTotalWeeks(data.total_weeks || 0);

  // Build a map: week -> { date, fullDate, totalSamples, totalSpoiled, <fruit>: spoilageRate }
  const weekMap = {};
  // Accumulate totals per fruit across all weeks (for the right-side summary)
  const fruitTotals = {};
  FRUITS.forEach(f => { fruitTotals[f] = { total: 0, spoiled: 0 }; });

      data.weekly_statistics.forEach(item => {
        const weekKey = item.week_starting;
        const fruit = (item.fruit || '').toLowerCase();
        const totalSamples = Number(item.total_samples || 0);
        const spoiledSamples = Number(item.spoiled_samples || 0);

        if (!weekMap[weekKey]) {
          weekMap[weekKey] = {
            date: new Date(weekKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            fullDate: new Date(weekKey).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            totalSamples: 0,
            totalSpoiled: 0
          };
          // initialize fruits to 0
          FRUITS.forEach(f => { weekMap[weekKey][f] = 0; });
        }

        // set fruit-specific spoilage rate for this week
        const fruitRate = totalSamples > 0 ? (spoiledSamples / totalSamples) * 100 : 0;
        if (FRUITS.includes(fruit)) {
          weekMap[weekKey][fruit] = Number(fruitRate.toFixed(2));
          // accumulate per-fruit totals
          fruitTotals[fruit].total += totalSamples;
          fruitTotals[fruit].spoiled += spoiledSamples;
        }

        // accumulate totals for the week (overall)
        weekMap[weekKey].totalSamples += totalSamples;
        weekMap[weekKey].totalSpoiled += spoiledSamples;
      });

      // convert to array and compute overall spoilage rate per week
      const formattedData = Object.values(weekMap)
        .map(week => ({
          date: week.date,
          fullDate: week.fullDate,
          spoilageRate: week.totalSamples > 0 ? Number(((week.totalSpoiled / week.totalSamples) * 100).toFixed(2)) : 0,
          totalSamples: week.totalSamples,
          spoiledSamples: week.totalSpoiled,
          // include fruits (banana, apple, strawberry, orange)
          banana: Number((week.banana || 0).toFixed ? week.banana : Number((week.banana || 0)).toFixed(2)),
          apple: Number((week.apple || 0).toFixed ? week.apple : Number((week.apple || 0)).toFixed(2)),
          strawberry: Number((week.strawberry || 0).toFixed ? week.strawberry : Number((week.strawberry || 0)).toFixed(2)),
          orange: Number((week.orange || 0).toFixed ? week.orange : Number((week.orange || 0)).toFixed(2))
        }))
        .sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));

      setTimeSeriesData(formattedData);
      // compute overall summary rates per fruit and store in state
      const summary = {};
      FRUITS.forEach(f => {
        const t = fruitTotals[f];
        const rate = t.total > 0 ? Number(((t.spoiled / t.total) * 100).toFixed(2)) : 0;
        summary[f] = { total: t.total, spoiled: t.spoiled, rate };
      });
      setFruitSummary(summary);
    } catch (err) {
      console.error('Error fetching time series data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    return (
      <div style={{
        backgroundColor: 'rgba(26, 32, 44, 0.95)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
      }}>
        <p style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600' }}>
          Week of {data.fullDate}
        </p>
        <p style={{ color: 'rgba(255, 255, 255, 0.7)', margin: '0 0 6px 0', fontSize: '12px' }}>
          Samples: {data.totalSamples} | Spoiled: {data.spoiledSamples}
        </p>
        {payload.map((p, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 10, height: 10, background: p.stroke || '#fff', borderRadius: 2 }} />
              <div style={{ color: '#fff', fontSize: 13 }}>{p.name}</div>
            </div>
            <div style={{ color: '#fff', fontSize: 13 }}>{p.value}%</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '16px',
        padding: '32px',
        marginBottom: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '300px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid rgba(255, 255, 255, 0.1)',
            borderTop: '4px solid #10b981',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: 'rgba(255, 255, 255, 0.7)', margin: 0 }}>Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '32px',
        textAlign: 'center'
      }}>
        <p style={{ color: '#ef4444', margin: '0 0 12px 0', fontSize: '16px', fontWeight: '600' }}>
          Failed to load dashboard
        </p>
        <p style={{ color: 'rgba(255, 255, 255, 0.6)', margin: '0 0 16px 0', fontSize: '14px' }}>
          {error}
        </p>
        <button
          onClick={fetchTimeSeriesData}
          style={{
            backgroundColor: '#ef4444',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '32px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    }}>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Left column: title, filters, and chart */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{
              color: '#374151',
              fontSize: '24px',
              fontWeight: '600',
              margin: '0 0 8px 0'
            }}>
              Weekly Spoilage Trends
            </h2>
          </div>

          {/* Fruit filters */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <div style={{ color: '#6b7280', fontSize: 14, fontWeight: 600 }}>Show fruits:</div>
            {FRUITS.map((f) => (
              <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!selectedFruits[f]}
                  onChange={() => setSelectedFruits(prev => ({ ...prev, [f]: !prev[f] }))}
                />
                <span style={{ color: FRUIT_COLORS[f], textTransform: 'capitalize', fontSize: 13 }}>{f}</span>
              </label>
            ))}
            <button
              onClick={() => {
                // toggle all on if any off, otherwise turn all off
                const anyOff = FRUITS.some(f => !selectedFruits[f]);
                const next = {};
                FRUITS.forEach(f => next[f] = anyOff);
                setSelectedFruits(next);
              }}
              style={{ marginLeft: 12, background: '#f3f4f6', border: 'none', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}
            >
              Toggle All
            </button>
          </div>

          {timeSeriesData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={timeSeriesData}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                style={{ outline: 'none' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.05)" />
                <XAxis 
                  dataKey="date" 
                  stroke="#6b7280"
                  style={{ fontSize: '12px' }}
                  tick={{ fill: '#6b7280' }}
                />
                <YAxis stroke="#6b7280" tick={{ fill: '#6b7280' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ color: '#6b7280', fontSize: '14px' }} />
                {FRUITS.map((fruit) => (
                  selectedFruits[fruit] && (
                    <Line
                      key={fruit}
                      type="monotone"
                      dataKey={fruit}
                      stroke={FRUIT_COLORS[fruit] || '#6b7280'}
                      strokeWidth={2}
                      dot={{ r: 4, strokeWidth: 0, fill: FRUIT_COLORS[fruit] || '#6b7280' }}
                      activeDot={{ r: 6 }}
                      name={`${fruit.charAt(0).toUpperCase() + fruit.slice(1)} (% )`}
                    />
                  )
                ))}
                <Line
                  type="monotone"
                  dataKey="spoilageRate"
                  stroke={TOTAL_COLOR}
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 0, fill: TOTAL_COLOR }}
                  activeDot={{ r: 6 }}
                  name="Total Spoilage Rate (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#374151'
            }}>
              <p style={{ margin: 0, fontSize: '16px' }}>No time series data available</p>
            </div>
          )}
        </div>

        {/* Right-side summary aligned with title top */}
        <div style={{ width: 300, alignSelf: 'flex-start' }}>
          <div style={{ marginBottom: 12, color: '#6b7280', fontWeight: 600 }}>Overall spoilage by fruit</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FRUITS.map(f => {
              const s = fruitSummary[f] || { total: 0, spoiled: 0, rate: 0 };
              return (
                <div key={f} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 8, background: '#fafafa', border: '1px solid #e6e6e6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 18 }}>{FRUIT_EMOJI[f] || '🍇'}</div>
                    <div style={{ fontSize: 14, color: '#374151', textTransform: 'capitalize' }}>{f}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#374151' }}>{s.rate}%</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{s.spoiled}/{s.total}</div>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: '#fff', border: '1px solid #e6e6e6' }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>Overall total</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: TOTAL_COLOR }}>{timeSeriesData.length ? `${timeSeriesData[timeSeriesData.length-1].spoilageRate}%` : '0%'}</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .recharts-wrapper {
          outline: none !important;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SpoilageDashboard;