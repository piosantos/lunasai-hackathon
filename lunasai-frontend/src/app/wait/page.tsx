'use client';

import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

const API_BASE_URL = '/api';

export default function WaitPage() {
  useEffect(() => {
    let isActive = true;

    const pollStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/v1/checkout/status`, {
          credentials: 'include',
        });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { status?: string; delivery_url?: string };
        if (isActive && data.status === 'paid' && data.delivery_url) {
          if (typeof data.delivery_url === 'string' && data.delivery_url.startsWith('/d/')) {
            window.location.href = data.delivery_url;
          } else {
            console.error('Invalid delivery URL received:', data.delivery_url);
          }
        }
      } catch {
        // Polling continues; transient network errors are ignored.
      }
    };

    void pollStatus();
    const intervalId = window.setInterval(() => {
      void pollStatus();
    }, 2000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white/80 p-8 text-center shadow-2xl shadow-indigo-100/50 backdrop-blur-xl">
        <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-indigo-600" />
        <h1 className="text-2xl font-semibold text-slate-900">Waiting for payment confirmation...</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          Securing your transaction... Our agent is verifying the payment with Mayar.
        </p>
      </div>
    </main>
  );
}
