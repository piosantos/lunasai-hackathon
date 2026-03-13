'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import React, { useState } from 'react';

const API_BASE_URL = '/api';

export default function DeliveryPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = React.use(params);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!token) {
      setErrorMessage('Invalid delivery token.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/d/${encodeURIComponent(token)}/download`, {
        method: 'POST',
      });

      const data = (await response.json()) as {
        signed_download_url?: string;
        detail?: string;
      };

      if (!response.ok) {
        const code = String(data.detail || '').toLowerCase();
        if (code.includes('expired')) {
          setErrorMessage('This delivery link has expired.');
        } else if (code.includes('limit')) {
          setErrorMessage('Download limit reached for this token.');
        } else {
          setErrorMessage(data.detail || 'Unable to process download request.');
        }
        return;
      }

      if (!data.signed_download_url) {
        setErrorMessage('Download URL is missing from server response.');
        return;
      }

      if (
        typeof data.signed_download_url === 'string' &&
        data.signed_download_url.startsWith('https://')
      ) {
        window.location.href = data.signed_download_url;
      } else {
        setErrorMessage('Invalid secure download link received.');
      }
    } catch {
      setErrorMessage('Network error while requesting download.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-emerald-50 px-6 py-12">
      <div className="w-full max-w-lg rounded-3xl border border-emerald-100 bg-white p-10 text-center shadow-[0_20px_50px_rgba(16,185,129,0.15)]">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Delivery Ready</h1>
        <p className="mt-2 text-sm text-slate-600">Your purchase is confirmed. Download your digital asset below.</p>

        <button
          type="button"
          onClick={() => {
            void handleDownload();
          }}
          disabled={isLoading}
          className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-emerald-200 transition-transform hover:-translate-y-1 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {isLoading ? 'Preparing Download...' : 'Download Digital Asset'}
        </button>

        {errorMessage && <p className="mt-4 text-sm font-medium text-red-600">{errorMessage}</p>}
      </div>
    </main>
  );
}
