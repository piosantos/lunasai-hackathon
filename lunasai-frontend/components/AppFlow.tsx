'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sparkles,
  Terminal,
  Upload,
} from 'lucide-react';

// --- Types ---

type ViewState = 'composer' | 'streaming' | 'complete';
type StreamEventType = 'info' | 'success' | 'process' | 'error';

interface StreamEvent {
  id: string;
  type: StreamEventType;
  message: string;
}

interface BackendStreamPayload {
  event?: string;
  message?: string;
}

const API_BASE_URL = '/api';

// --- Components ---

function PromptComposerForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (prompt: string, hasFile: boolean) => Promise<void> | void;
  isSubmitting: boolean;
}) {
  const [prompt, setPrompt] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isSubmitting) {
      void onSubmit(prompt, Boolean(attachedFile));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <div>
        <label htmlFor="prompt" className="mb-3 block text-sm font-medium text-slate-200">
          Product Description
        </label>
        <textarea
          id="prompt"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g., A comprehensive video course on advanced React patterns, including 10 hours of video and a starter template..."
          className="w-full resize-none rounded-[24px] border border-white/10 bg-slate-900/70 px-5 py-4 text-white placeholder:text-slate-500 shadow-inner shadow-slate-950/40 transition-all focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
          required
          data-testid="prompt-input"
        />
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Give the agent a clear product description, format, and the outcome the buyer should expect.
        </p>
      </div>

      <div
        className="flex cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-600/80 bg-white/5 p-6 text-center opacity-70 transition-all duration-300 hover:border-indigo-400 hover:bg-white/[0.07] hover:opacity-100"
        onClick={() => {
          fileInputRef.current?.click();
        }}
      >
        <Upload className={`mb-2 ${attachedFile ? 'text-indigo-400' : 'text-slate-500'}`} size={24} />
        <span className="text-sm font-medium text-slate-200">
          {attachedFile ? attachedFile.name : 'Attach digital asset (Optional)'}
        </span>
        <span className="mt-1 text-xs text-slate-400">PDF, ZIP, MP4 up to 500MB</span>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            setAttachedFile(event.target.files?.[0] ?? null);
          }}
        />
        <input type="checkbox" checked={Boolean(attachedFile)} readOnly className="hidden" data-testid="file-attached-state" />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={!prompt.trim() || isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#6366f1,#7c3aed)] px-6 py-4 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(99,102,241,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_48px_rgba(124,58,237,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="generate-button"
        >
          {isSubmitting ? 'Starting Generation...' : 'Generate Storefront'}
          {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
        </button>
      </div>
    </form>
  );
}

function StreamingTerminal({
  onGenerationComplete,
  onError,
  jobId,
}: {
  onGenerationComplete: () => void | Promise<void>;
  onError: (message: string) => void;
  jobId: string;
}) {
  const [events, setEvents] = useState<StreamEvent[]>([]);

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE_URL}/v1/jobs/${jobId}/stream`);

    const mapEvent = (payload: BackendStreamPayload): StreamEvent => {
      const backendEvent = payload.event;

      switch (backendEvent) {
        case 'job_started':
          return {
            id: crypto.randomUUID(),
            type: 'info',
            message: 'Job started. Initializing agent...',
          };
        case 'llm_completed':
          return {
            id: crypto.randomUUID(),
            type: 'process',
            message: 'LLM generation completed.',
          };
        case 'schema_validated':
          return {
            id: crypto.randomUUID(),
            type: 'success',
            message: 'Schema validated successfully.',
          };
        case 'tiers_created':
          return {
            id: crypto.randomUUID(),
            type: 'success',
            message: 'Pricing tiers created.',
          };
        case 'mayar_links_created':
          return {
            id: crypto.randomUUID(),
            type: 'success',
            message: 'Mayar payment links created.',
          };
        case 'generation_complete':
          return {
            id: crypto.randomUUID(),
            type: 'success',
            message: 'Generation complete. Storefront is ready for publishing.',
          };
        case 'error':
          return {
            id: crypto.randomUUID(),
            type: 'error',
            message: payload.message || 'Generation failed.',
          };
        default:
          return {
            id: crypto.randomUUID(),
            type: 'info',
            message: payload.message || 'Received backend update.',
          };
      }
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as BackendStreamPayload;
        const mapped = mapEvent(payload);

        setEvents((prev) => [...prev, mapped]);

        if (payload.event === 'generation_complete') {
          eventSource.close();
          void onGenerationComplete();
          return;
        }
        if (payload.event === 'error') {
          eventSource.close();
          onError(payload.message || 'Generation failed.');
        }
      } catch {
        const fallback: StreamEvent = {
          id: crypto.randomUUID(),
          type: 'error',
          message: 'Invalid stream payload received.',
        };
        setEvents((prev) => [...prev, fallback]);
        eventSource.close();
        onError('Invalid stream payload received.');
      }
    };

    eventSource.onerror = () => {
      setEvents((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'error',
          message: 'Stream disconnected unexpectedly.',
        },
      ]);
      eventSource.close();
      onError('Stream disconnected unexpectedly.');
    };

    return () => {
      eventSource.close();
    };
  }, [jobId, onError, onGenerationComplete]);

  const lastEventType = events.length > 0 ? events[events.length - 1].type : null;

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/75 text-slate-200 shadow-[0_32px_120px_rgba(2,6,23,0.55)] backdrop-blur-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4 text-slate-300">
        <Terminal size={16} />
        <span className="text-sm">Generation Stream</span>
      </div>

      <div className="flex-1 p-6 font-mono text-sm overflow-y-auto space-y-3" data-testid="streaming-terminal-output">
        {events.map((event) => (
          <div key={event.id} className="flex items-start gap-3">
            <span className="select-none text-slate-600">{`[${new Date().toISOString().split('T')[1].slice(0, 8)}]`}</span>

            {event.type === 'process' && <Loader2 size={16} className="text-blue-400 animate-spin mt-0.5 shrink-0" />}
            {event.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />}
            {event.type === 'info' && <span className="mt-0.5 shrink-0 text-slate-400">→</span>}
            {event.type === 'error' && <span className="text-red-400 mt-0.5 shrink-0">✖</span>}
            <span
              className={`
            ${event.type === 'success' ? 'text-emerald-400' : ''}
            ${event.type === 'process' ? 'text-blue-400' : ''}
            ${event.type === 'info' ? 'text-slate-300' : ''}
            ${event.type === 'error' ? 'text-red-400' : ''}
          `}
            >
              {event.message}
            </span>
          </div>
        ))}

        {events.length > 0 && lastEventType !== 'success' && lastEventType !== 'error' && (
          <div className="mt-4 flex animate-pulse items-center gap-2 text-slate-500">
            <span className="w-2 h-4 bg-emerald-400 inline-block"></span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppFlow() {
  const [viewState, setViewState] = useState<ViewState | 'error'>('composer');
  const [submittedData, setSubmittedData] = useState<{ prompt: string; hasFile: boolean } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [storefrontUrl, setStorefrontUrl] = useState<string | null>(null);
  const [streamErrorMessage, setStreamErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComposeSubmit = async (prompt: string, hasFile: boolean) => {
    setIsSubmitting(true);
    setSubmittedData({ prompt, hasFile });
    setStreamErrorMessage(null);

    try {
      const createProductResponse = await fetch(`${API_BASE_URL}/v1/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_text: prompt }),
      });

      if (!createProductResponse.ok) {
        throw new Error('Failed to create product.');
      }

      const createProductData = (await createProductResponse.json()) as { product_id?: string };
      if (!createProductData.product_id) {
        throw new Error('Backend did not return product_id.');
      }
      setProductId(createProductData.product_id);

      const generateJobResponse = await fetch(
        `${API_BASE_URL}/v1/products/${createProductData.product_id}/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (!generateJobResponse.ok) {
        throw new Error('Failed to start generation job.');
      }

      const generateJobData = (await generateJobResponse.json()) as { job_id?: string };
      if (!generateJobData.job_id) {
        throw new Error('Backend did not return job_id.');
      }

      setJobId(generateJobData.job_id);
      setViewState('streaming');
    } catch {
      setJobId(null);
      setProductId(null);
      setStorefrontUrl(null);
      setViewState('composer');
      alert('Unable to start generation. Please check backend connectivity and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStreamComplete = async () => {
    if (productId) {
      try {
        const publishResponse = await fetch(`${API_BASE_URL}/v1/products/${productId}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!publishResponse.ok) {
          throw new Error('Failed to publish storefront.');
        }

        const publishData = (await publishResponse.json()) as { storefront_url?: string };
        setStorefrontUrl(publishData.storefront_url || null);
      } catch {
        setStorefrontUrl(null);
        alert('Generation completed, but storefront publish failed.');
      }
    }

    setViewState('complete');
  };

  const handleStreamError = (message: string) => {
    setStorefrontUrl(null);
    setStreamErrorMessage(message);
    setViewState('error');
  };

  if (viewState === 'composer') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.22),_rgba(15,23,42,1)_42%,_rgba(2,6,23,1)_100%)] p-6 text-slate-50">
        <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-slate-950/70 p-8 shadow-[0_32px_120px_rgba(15,23,42,0.62)] backdrop-blur-2xl">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-2xl bg-indigo-500/12 p-3 text-indigo-300 ring-1 ring-indigo-400/20">
              <Sparkles size={18} />
            </div>
            <div>
              <h1 className="text-[28px] font-semibold tracking-tight text-white">LunasAI Composer</h1>
              <p className="text-sm leading-6 text-slate-400">Describe your product and let the agent turn it into a complete storefront.</p>
            </div>
          </div>

          <PromptComposerForm onSubmit={handleComposeSubmit} isSubmitting={isSubmitting} />
        </div>
      </div>
    );
  }

  if (viewState === 'streaming' && jobId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-50">
        <div className="relative w-full max-w-4xl rounded-2xl bg-slate-900 p-[2px] before:absolute before:-inset-[2px] before:-z-10 before:animate-pulse before:rounded-2xl before:bg-gradient-to-r before:from-indigo-500 before:via-purple-500 before:to-indigo-500 before:content-['']">
          <StreamingTerminal onGenerationComplete={handleStreamComplete} onError={handleStreamError} jobId={jobId} />
        </div>
      </div>
    );
  }

  if (viewState === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-50">
        <div className="w-full max-w-2xl rounded-2xl border border-red-900/70 bg-slate-900/50 p-8 text-center shadow-2xl backdrop-blur-xl">
          <h2 className="text-xl font-semibold text-red-300">Generation Failed</h2>
          <p className="mt-2 text-sm text-red-200">{streamErrorMessage || 'An unexpected error occurred during generation.'}</p>
          <button
            type="button"
            onClick={() => {
              setJobId(null);
              setProductId(null);
              setStorefrontUrl(null);
              setStreamErrorMessage(null);
              setViewState('composer');
            }}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 font-medium text-white transition-all hover:-translate-y-0.5"
          >
            Try Again
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-50">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
          <CheckCircle2 size={24} />
        </div>
        <h2 className="text-xl font-semibold text-slate-50">Generation Complete</h2>
        <p className="mt-2 text-sm text-slate-400">
          {submittedData ? `Prompt submitted: "${submittedData.prompt}"` : 'Your storefront pipeline has finished.'}
        </p>
        {storefrontUrl && (
          <button
            type="button"
            onClick={() => window.open(storefrontUrl, '_blank')}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 font-medium text-white transition-all hover:-translate-y-0.5"
          >
            Open Storefront Preview
            <ArrowRight size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setJobId(null);
            setProductId(null);
            setStorefrontUrl(null);
            setSubmittedData(null);
            setViewState('composer');
          }}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-6 py-3 font-medium text-slate-100 transition-colors hover:bg-slate-700"
        >
          Create Another
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}
