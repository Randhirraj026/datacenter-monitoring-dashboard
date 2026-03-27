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

  // When hostOptions change and we don't have a hostId set, set it.
  useEffect(() => {
    if (!hostId && hostOptions?.length) {
      setHostId(hostOptions[0].id);
    }
  }, [hostOptions, hostId]);

  const checkRisk = () => {
    if (!predictions.length) return 'Normal operations expected.';
    const maxVal = Math.max(...predictions.map(p => p.value));
    const thresholds = {
      cpu: 90,
      memory: 92,
      power: 8,
      temperature: 42
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
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API}/superadmin/predict?host_id=${hostId}&metric=${metric}&range=${range}`, {
          headers: getAuthHeader()
        });
        if (!res.ok) throw new Error('Failed to fetch predictions');
        const data = await res.json();
        
        // Fetch history just for the baseline graph 
        const histRes = await fetch(`${API}/superadmin/details?section=${metric}&range=${range}&hostId=${hostId}&pageSize=3000`, {
          headers: getAuthHeader()
        });
        const histData = await histRes.json();
        
        if (isMounted) {
          setPredictions(data.predictions || []);
          if(histData && histData.rows) {
            setHistory(histData.rows);
          }
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadPredictions();
    return () => { isMounted = false; };
  }, [hostId, metric, range]);

  return (
    <div className="col-span-1 xl:col-span-2 rounded-[30px] border border-blue-200/80 bg-gradient-to-br from-blue-50/60 to-white px-6 py-8 shadow-xl backdrop-blur relative overflow-hidden mb-6">
      
      {/* Decorative gradient orb for AI vibe */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3"></div>

      <div className="relative z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-black text-slate-900 flex items-center gap-2">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">AI</span> 
              Prediction & Forecasting
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-1">Deep learning based future trends analysis.</p>
          </div>
          <div className="flex items-center gap-3 bg-white px-4 py-2 border border-slate-200 rounded-2xl shadow-sm">
            <label className="text-sm font-extrabold text-slate-600">Select Hosts:</label>
            <select 
              value={hostId} 
              onChange={(e) => setHostId(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-800 outline-none w-48 truncate"
            >
              <option value="" disabled>Select Host</option>
              {hostOptions?.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-4 mb-8 items-center justify-between bg-white p-4 rounded-[20px] border border-slate-100 shadow-[0_4px_24px_rgba(15,23,42,0.04)]">
          <MetricSelector value={metric} onChange={setMetric} />
          <RangeSelector value={range} onChange={setRange} />
          
          <label className="flex items-center gap-3 cursor-pointer p-1">
            <span className="text-sm font-black text-slate-700 uppercase tracking-widest">AI Vision</span>
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={showPredictions} onChange={(e) => setShowPredictions(e.target.checked)} />
              <div className={`block w-12 h-6 rounded-full transition-all duration-300 ${showPredictions ? 'bg-gradient-to-r from-blue-500 to-indigo-500 shadow-inner' : 'bg-slate-300'}`}></div>
              <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-300 shadow-sm ${showPredictions ? 'translate-x-6' : ''}`}></div>
            </div>
          </label>
        </div>

        {loading ? (
          <div className="h-[320px] flex items-center justify-center bg-white/50 rounded-[20px] border border-dashed border-blue-200">
            <div className="text-indigo-600 font-black animate-pulse flex flex-col items-center gap-3">
               <div className="w-10 h-10 rounded-full border-[4px] border-indigo-600 border-t-transparent animate-spin"></div>
               <span className="tracking-widest capitalize">Synthesizing Future Data...</span>
            </div>
          </div>
        ) : error ? (
          <div className="h-[320px] flex items-center justify-center text-red-500 font-bold bg-white/50 rounded-[20px] border border-red-100">{error}</div>
        ) : (
          <div className="bg-white p-4 rounded-[24px] shadow-sm border border-slate-100/50">
            <PredictionChart historicalData={history} predictedData={predictions} showPredictions={showPredictions} />
            
            <div className={`mt-6 p-4 rounded-2xl flex items-center gap-4 transition-colors ${checkRisk().includes('Risk') ? 'bg-red-50 border border-red-100' : 'bg-green-50/50 border border-green-100'}`}>
              <span className={`flex items-center justify-center w-10 h-10 rounded-full font-black text-xl text-white shadow-sm ${checkRisk().includes('Risk') ? 'bg-red-500' : 'bg-green-500'}`}>
                {checkRisk().includes('Risk') ? '!' : '✓'}
              </span>
              <div>
                <div className={`text-xs font-black uppercase tracking-widest mb-1 ${checkRisk().includes('Risk') ? 'text-red-500' : 'text-green-600'}`}>
                  AI Anomaly Detection
                </div>
                <div className="text-base font-semibold text-slate-700">
                  {checkRisk()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
