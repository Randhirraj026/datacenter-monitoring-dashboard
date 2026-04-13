import { useEffect, useState } from 'react';
import MetricSelector from './MetricSelector';
import RangeSelector from './RangeSelector';
import PredictionChart from './PredictionChart';
import { API } from '../../constants/config';
import { getAuthHeader } from '../../services/api';

export default function PredictionPanel({ hostOptions }) {
  const [metric, setMetric] = useState('cpu');
  const [range, setRange] = useState('24h');
  const [hostId, setHostId] = useState(hostOptions?.[0]?.id || '');
  const [showPredictions, setShowPredictions] = useState(true);

  const [predictions, setPredictions] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!hostId && hostOptions?.length) {
      setHostId(hostOptions[0].id);
    }
  }, [hostOptions, hostId]);

  const checkRisk = () => {
    if (!predictions.length) return 'Normal operations expected.';
    const maxVal = Math.max(...predictions.map((point) => point.value));
    const thresholds = {
      cpu: 90,
      memory: 92,
      power: 8,
      temperature: 42,
    };

    if (maxVal > thresholds[metric]) {
      return `Risk Alert! Predicted peak hits ${maxVal.toFixed(1)} which exceeds critical threshold.`;
    }

    return 'Normal operations expected. No risk detected.';
  };

  useEffect(() => {
    if (!hostId) return;

    let isMounted = true;
    const loadPredictions = async () => {
      const predictionQuery = new URLSearchParams({
        host_id: String(hostId),
        metric,
        range,
      });
      const historyQuery = new URLSearchParams({
        section: metric,
        range,
        hostId: String(hostId),
        pageSize: '3000',
      });

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API}/superadmin/predict?${predictionQuery.toString()}`, {
          headers: getAuthHeader(),
        });
        if (!res.ok) throw new Error('Failed to fetch predictions');
        const data = await res.json();

        const histRes = await fetch(`${API}/superadmin/details?${historyQuery.toString()}`, {
          headers: getAuthHeader(),
        });
        if (!histRes.ok) throw new Error('Failed to fetch historical data');
        const histData = await histRes.json();

        if (isMounted) {
          setPredictions(data.predictions || []);
          setHistory(histData?.rows || []);
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPredictions();
    return () => {
      isMounted = false;
    };
  }, [hostId, metric, range]);

  const riskDetected = checkRisk().includes('Risk');

  return (
    <div className="relative col-span-1 mb-6 overflow-hidden rounded-[30px] border border-blue-200/80 bg-gradient-to-br from-blue-50/60 to-white px-6 py-8 shadow-xl backdrop-blur xl:col-span-2">
      <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 -translate-y-1/2 translate-x-1/3 rounded-full bg-blue-400/10 blur-3xl" />

      <div className="relative z-10">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="flex items-center gap-2 text-3xl font-black text-slate-900">
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">AI</span>
              Prediction & Forecasting
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Deep learning based future trends analysis.</p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
            <label className="text-sm font-extrabold text-slate-600">Select Host:</label>
            <select
              value={hostId}
              onChange={(event) => setHostId(event.target.value)}
              className="w-48 truncate bg-transparent text-sm font-bold text-slate-800 outline-none"
            >
              <option value="" disabled>Select Host</option>
              {hostOptions?.map((host) => (
                <option key={host.id} value={host.id}>{host.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-slate-100 bg-white p-4 shadow-[0_4px_24px_rgba(15,23,42,0.04)]">
          <MetricSelector value={metric} onChange={setMetric} />
          <RangeSelector value={range} onChange={setRange} />

          <label className="flex cursor-pointer items-center gap-3 p-1">
            <span className="text-sm font-black uppercase tracking-widest text-slate-700">AI Vision</span>
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={showPredictions}
                onChange={(event) => setShowPredictions(event.target.checked)}
              />
              <div className={`block h-6 w-12 rounded-full transition-all duration-300 ${showPredictions ? 'bg-gradient-to-r from-blue-500 to-indigo-500 shadow-inner' : 'bg-slate-300'}`} />
              <div className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${showPredictions ? 'translate-x-6' : ''}`} />
            </div>
          </label>
        </div>

        {loading ? (
          <div className="flex h-[320px] items-center justify-center rounded-[20px] border border-dashed border-blue-200 bg-white/50">
            <div className="flex flex-col items-center gap-3 font-black text-indigo-600 animate-pulse">
              <div className="h-10 w-10 animate-spin rounded-full border-[4px] border-indigo-600 border-t-transparent" />
              <span className="capitalize tracking-widest">Synthesizing future data...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-[320px] items-center justify-center rounded-[20px] border border-red-100 bg-white/50 font-bold text-red-500">
            {error}
          </div>
        ) : (
          <div className="rounded-[24px] border border-slate-100/50 bg-white p-4 shadow-sm">
            <PredictionChart historicalData={history} predictedData={predictions} showPredictions={showPredictions} />

            <div className={`mt-6 flex items-center gap-4 rounded-2xl border p-4 transition-colors ${riskDetected ? 'border-red-100 bg-red-50' : 'border-green-100 bg-green-50/50'}`}>
              <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xl font-black text-white shadow-sm ${riskDetected ? 'bg-red-500' : 'bg-green-500'}`}>
                {riskDetected ? '!' : 'OK'}
              </span>
              <div>
                <div className={`mb-1 text-xs font-black uppercase tracking-widest ${riskDetected ? 'text-red-500' : 'text-green-600'}`}>
                  AI Anomaly Detection
                </div>
                <div className="text-base font-semibold text-slate-700">{checkRisk()}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
