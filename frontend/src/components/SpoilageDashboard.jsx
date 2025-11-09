import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const SpoilageDashboard = () => {
  const [timeSeriesData, setTimeSeriesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalWeeks, setTotalWeeks] = useState(0);

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
      
      // Group by week and calculate overall spoilage rate per week
      const weeklyData = {};
      
      data.weekly_statistics.forEach(item => {
        const weekKey = item.week_starting;
        
        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = {
            week: weekKey,
            totalSamples: 0,
            totalSpoiled: 0
          };
        }
        
        weeklyData[weekKey].totalSamples += item.total_samples;
        weeklyData[weekKey].totalSpoiled += item.spoiled_samples;
      });
      
      // Convert to array and calculate overall spoilage percentage
      const formattedData = Object.values(weeklyData)
        .map(week => ({
          date: new Date(week.week).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          }),
          spoilageRate: week.totalSamples > 0 
            ? ((week.totalSpoiled / week.totalSamples) * 100).toFixed(2)
            : 0,
          fullDate: new Date(week.week).toLocaleDateString('en-US', { 
            year: 'numeric',
            month: 'long', 
            day: 'numeric' 
          }),
          totalSamples: week.totalSamples,
          spoiledSamples: week.totalSpoiled
        }))
        .sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate)); // Sort chronologically

      setTimeSeriesData(formattedData);
    } catch (err) {
      console.error('Error fetching time series data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div style={{
          backgroundColor: 'rgba(26, 32, 44, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
        }}>
          <p style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600' }}>
            Week of {data.fullDate}
          </p>
          <p style={{ color: '#ef4444', margin: '0 0 4px 0', fontSize: '13px' }}>
            Spoilage Rate: {data.spoilageRate}%
          </p>
          <p style={{ color: 'rgba(255, 255, 255, 0.7)', margin: '0 0 2px 0', fontSize: '12px' }}>
            Spoiled: {data.spoiledSamples} / {data.totalSamples} samples
          </p>
        </div>
      );
    }
    return null;
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
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{
          color: '#374151',
          fontSize: '24px',
          fontWeight: '600',
          margin: '0 0 8px 0'
        }}>
          Weekly Spoilage Trends
        </h2>
      </div>

      {timeSeriesData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={timeSeriesData}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            style={{ outline: 'none' }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0)" />
            <XAxis 
              dataKey="date" 
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
              tick={{ fill: '#6b7280' }}
            />

            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ color: '#6b7280', fontSize: '14px' }}
            />
            <Line 
              type="monotone" 
              dataKey="spoilageRate" 
              stroke="#ef4444" 
              strokeWidth={3}
              dot={{ fill: '#ef4444', r: 5 }}
              activeDot={{ r: 7 }}
              name="Spoilage Rate (%)"
              label={(props) => {
                const { x, y, value } = props;
                return (
                  <text 
                    x={x} 
                    y={y - 10} 
                    fill="#ef4444" 
                    fontSize={12} 
                    textAnchor="middle"
                  >
                    {value}%
                  </text>
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#fff)'
        }}>
          <p style={{ margin: 0, fontSize: '16px' }}>No time series data available</p>
        </div>
      )}

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