import { Line } from 'react-chartjs-2';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export default function PredictionChart({ historicalData, predictedData, showPredictions }) {
  const labels = new Set([
    ...(historicalData || []).map(d => d.timestamp),
    ...(showPredictions ? (predictedData || []).map(d => d.timestamp) : [])
  ]);
  
  const sortedLabels = Array.from(labels).sort((a,b) => new Date(a) - new Date(b));
  
  const formatTs = (ts) => {
    return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  
  const histMap = new Map();
  (historicalData || []).forEach(d => {
    let val = d.cpuUsagePct ?? d.memoryUsagePct ?? d.powerKw ?? d.temperatureC ?? d.value;
    if (val !== undefined && val !== null) {
        histMap.set(d.timestamp, val);
    }
  });

  const predMap = new Map();
  (predictedData || []).forEach(d => predMap.set(d.timestamp, d.value));
  
  const datasets = [
    {
      label: `Historical Baseline`,
      data: sortedLabels.map(l => histMap.get(l) ?? null),
      borderColor: '#2563eb',
      backgroundColor: 'rgba(37,99,235,0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2
    }
  ];
  
  if (showPredictions) {
    datasets.push({
      label: `AI Prediction`,
      data: sortedLabels.map(l => predMap.get(l) ?? null),
      borderColor: '#f59e0b',
      backgroundColor: 'transparent',
      borderDash: [5, 5],
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2
    });
  }

  const data = {
    labels: sortedLabels.map(formatTs),
    datasets
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: { 
        mode: 'index', 
        intersect: false,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += context.parsed.y.toFixed(2);
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
      y: { beginAtZero: false, grid: { color: 'rgba(148,163,184,0.16)' }, ticks: { color: '#64748b' } }
    }
  };

  return <div className="h-[320px] w-full"><Line data={data} options={options} /></div>;
}
