import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import axios from 'axios';
import './App.css';

// API configuration
const API = axios.create({
  baseURL: 'http://localhost:8000',
  headers: {
    'Content-Type': 'multipart/form-data'
  }
});

function App() {
  const [idfFile, setIdfFile] = useState(null);
  const [weatherFile, setWeatherFile] = useState(null);
  const [length, setLength] = useState('');
  const [width, setWidth]   = useState('');
  const [height, setHeight] = useState('');
  const [runId, setRunId]   = useState('');
  const [plotData, setPlotData] = useState([]);
  const [status, setStatus]     = useState('idle');
  const [error, setError]       = useState(null);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (setter) => (e) => {
    if (e.target.files && e.target.files[0]) {
      setter(e.target.files[0]);
      setError(null);
    }
  };

  const handleRunSimulation = async () => {
    setError(null);

    // Validate inputs
    if (!weatherFile) {
      setError('Please select a weather (.epw) file');
      return;
    }
    if (!idfFile && !(length && width && height)) {
      setError('Please upload an IDF or enter building dimensions');
      return;
    }

    setStatus('uploading');
    setProgress(0);

    try {
      const formData = new FormData();
      if (idfFile) {
        formData.append('idf_file', idfFile);
      }
      formData.append('weather_file', weatherFile);
      formData.append('length',  length);
      formData.append('width',   width);
      formData.append('height',  height);

      const response = await API.post('/simulate', formData, {
        onUploadProgress: (e) => {
          const percent = Math.round((e.loaded * 100) / e.total);
          setProgress(percent);
        }
      });

      setRunId(response.data.run_id);
      setStatus('running');
    } catch (err) {
      setStatus('error');
      setError(err.response?.data?.detail || 'Failed to start simulation');
      console.error(err);
    }
  };

  const getResults = async (id) => {
    return API.get(`/results/${id}`);
  };

  // useEffect(() => {
  //   let intervalId;
  //   if (status === 'running' && runId) {
  //     intervalId = setInterval(async () => {
  //       try {
  //         const { data } = await getResults(runId);
  //         if (data.includes('Date/Time')) {
  //           const parsed = parseEnergyPlusCSV(data);
  //           if (parsed.length) {
  //             setPlotData(parsed);
  //             setStatus('completed');
  //             clearInterval(intervalId);
  //           }
  //         }
  //       } catch (err) {
  //         if (err.response?.status === 404) {
  //           // still running
  //         } else {
  //           setStatus('error');
  //           setError(err.response?.data?.detail || 'Error fetching results');
  //           clearInterval(intervalId);
  //         }
  //       }
  //     }, 5000);
  //   }
  //   return () => clearInterval(intervalId);
  // }, [status, runId]);

  useEffect(() => {
    let intervalId;
    if (status === 'running' && runId) {
      intervalId = setInterval(async () => {
        try {
          const { data } = await getResults(runId);
          if (data.data && data.data.length) {
            setPlotData(data.data);
            setStatus('completed');
            clearInterval(intervalId);
          }
        } catch (err) {
          if (err.response?.status === 404) {
            // Still waiting for results
          } else {
            setStatus('error');
            setError(err.response?.data?.detail || 'Error fetching results');
            console.error('Full error:', err.response?.data);
            clearInterval(intervalId);
          }
        }
      }, 5000);
    }
    return () => clearInterval(intervalId);
  }, [status, runId]);

  const parseEnergyPlusCSV = (csvData) => {
    const lines = csvData.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    const dtIdx = headers.indexOf('Date/Time');
    const valIdx = headers.findIndex(h => h.includes('Zone Air Temperature'));
    if (dtIdx < 0 || valIdx < 0) return [];
    return lines.slice(1).map(line => {
      const cols = line.split(',');
      return { time: cols[dtIdx], value: parseFloat(cols[valIdx]) };
    }).filter(d => !isNaN(d.value));
  };

  const resetSimulation = () => {
    setIdfFile(null);
    setWeatherFile(null);
    setLength('');
    setWidth('');
    setHeight('');
    setRunId('');
    setPlotData([]);
    setStatus('idle');
    setError(null);
    setProgress(0);
  };

  const canRun =
    weatherFile &&
    (idfFile || (length && width && height)) &&
    status === 'idle';

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6 text-center">
        EnergyPlus Simulation Dashboard
      </h1>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Simulation Parameters</h2>

        {/* Dimensions or IDF upload */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Length (m)
            </label>
            <input
              type="number"
              step="0.1"
              value={length}
              onChange={e => setLength(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Width (m)
            </label>
            <input
              type="number"
              step="0.1"
              value={width}
              onChange={e => setWidth(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Height (m)
            </label>
            <input
              type="number"
              step="0.1"
              value={height}
              onChange={e => setHeight(e.target.value)}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
            />
          </div>
        </div>

        {/* IDF File upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Or upload an IDF File (Building Model)
          </label>
          <div className="flex items-center gap-2">
            <label className="flex-1 cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm text-gray-700 hover:bg-gray-50">
              {idfFile ? idfFile.name : 'Select .idf file'}
              <input
                type="file"
                accept=".idf"
                onChange={handleFileChange(setIdfFile)}
                className="hidden"
              />
            </label>
            {idfFile && (
              <button
                onClick={() => setIdfFile(null)}
                className="text-red-500 hover:text-red-700 p-2"
                title="Remove file"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Weather File upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Weather File (EPW)
          </label>
          <div className="flex items-center gap-2">
            <label className="flex-1 cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm text-gray-700 hover:bg-gray-50">
              {weatherFile ? weatherFile.name : 'Select .epw file'}
              <input
                type="file"
                accept=".epw"
                onChange={handleFileChange(setWeatherFile)}
                className="hidden"
              />
            </label>
            {weatherFile && (
              <button
                onClick={() => setWeatherFile(null)}
                className="text-red-500 hover:text-red-700 p-2"
                title="Remove file"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {status === 'uploading' && (
          <div className="mb-4">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Uploading files... {progress}%
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleRunSimulation}
            disabled={!canRun}
            className={`px-4 py-2 rounded-md text-white font-medium ${
              !canRun
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {status === 'running' ? 'Running Simulation...' : 'Run Simulation'}
          </button>

          {(status === 'completed' || status === 'error') && (
            <button
              onClick={resetSimulation}
              className="px-4 py-2 rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              Reset
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-100 border-l-4 border-red-500 text-red-700">
            <p>{error}</p>
          </div>
        )}
      </div>

      {status === 'completed' && plotData.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Simulation Results</h2>
            <div className="text-sm text-gray-500">
              Run ID: <code className="bg-gray-100 px-2 py-1 rounded">{runId}</code>
            </div>
          </div>
          <div className="h-96">
            <Plot
              data={[
                {
                  x: plotData.map((d) => d.time),
                  y: plotData.map((d) => d.value),
                  type: 'scatter',
                  mode: 'lines+markers',
                  line: { shape: 'spline', width: 2, smoothing: 1.3 },
                  marker: { size: 4 },
                  hoverinfo: 'x+y',
                  hovertemplate: '%{x}<br>%{y:.2f}°C<extra></extra>',
                },
              ]}
              layout={{
                title: 'Zone Air Temperature Over Time',
                xaxis: {
                  title: 'Date/Time',
                  type: 'category',
                  tickangle: 45,
                  nticks: 10,
                },
                yaxis: {
                  title: 'Temperature (°C)',
                  range: [
                    Math.min(...plotData.map((d) => d.value)) - 1,
                    Math.max(...plotData.map((d) => d.value)) + 1,
                  ],
                },
                margin: { t: 40, r: 30, b: 80, l: 60 },
                hovermode: 'closest',
                showlegend: false,
              }}
              config={{ responsive: true, displayModeBar: true, scrollZoom: true }}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        </div>
      )}

      <div className="mt-6 text-center text-sm text-gray-500">
        <p>
          Status:{' '}
          <span
            className={`font-medium capitalize ${
              status === 'completed'
                ? 'text-green-600'
                : status === 'error'
                ? 'text-red-600'
                : status === 'running'
                ? 'text-blue-600'
                : 'text-gray-600'
            }`}
          >
            {status}
          </span>
        </p>
      </div>
    </div>
  );
}

export default App;

