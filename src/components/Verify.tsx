import React, { useState } from 'react';

export function Verify() {
  const [status, setStatus] = useState<string>('idle');
  const [res, setRes] = useState<any>(null);

  const checkHealth = async () => {
    setStatus('checking...');
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setRes(data);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setRes(err);
    }
  };

  return (
    <div className="p-4 border rounded bg-white shadow-sm mt-4">
      <h2 className="text-lg font-bold mb-2">Backend Verification</h2>
      <button 
        onClick={checkHealth}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Check /api/health
      </button>
      <div className="mt-2">
        <p>Status: {status}</p>
        {res && <pre className="text-xs bg-gray-100 p-2 overflow-auto">{JSON.stringify(res, null, 2)}</pre>}
      </div>
    </div>
  );
}
