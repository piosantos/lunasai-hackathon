'use client';

import { ArrowRight, CheckCircle2, Loader2, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';

const API_BASE_URL = '/api';

interface StorefrontTier {
  tier_id?: string;
  name: string;
  price: number;
  description: string;
}

interface StorefrontData {
  product_id?: string;
  headline: string;
  benefits: string[];
  tiers: StorefrontTier[];
}

const benefitIcons = [Sparkles, Zap, ShieldCheck, CheckCircle2];

function splitBenefitContent(benefit: string): { title: string; description: string } {
  const value = benefit.trim();
  if (!value) {
    return {
      title: 'Premium benefit',
      description: 'Detailed AI-generated benefit explanation goes here to fill the space.',
    };
  }

  const dashMatch = value.match(/^(.{4,48}?)(?:\s[-:]\s)(.+)$/);
  if (dashMatch) {
    return {
      title: dashMatch[1].trim(),
      description: dashMatch[2].trim(),
    };
  }

  const sentenceMatch = value.match(/^(.{4,48}?[.!?])\s+(.+)$/);
  if (sentenceMatch) {
    return {
      title: sentenceMatch[1].replace(/[.!?]+$/, '').trim(),
      description: sentenceMatch[2].trim(),
    };
  }

  const words = value.split(/\s+/).filter(Boolean);
  const title = words.slice(0, 6).join(' ');
  const remainder = words.slice(6).join(' ').trim();

  return {
    title: title || value,
    description:
      remainder || 'Detailed AI-generated benefit explanation goes here to fill the space.',
  };
}

export default function StorefrontPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = React.use(params);
  const [storefront, setStorefront] = useState<StorefrontData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [buyingTierId, setBuyingTierId] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadStorefront = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`${API_BASE_URL}/v1/storefront/${encodeURIComponent(slug)}`);
        if (!response.ok) {
          throw new Error('Storefront not found.');
        }

        const data = (await response.json()) as Partial<StorefrontData>;
        if (!isActive) {
          return;
        }

        setStorefront({
          product_id: typeof data.product_id === 'string' ? data.product_id : undefined,
          headline: data.headline || `Storefront Preview for ${slug}`,
          benefits: Array.isArray(data.benefits) ? data.benefits : [],
          tiers: Array.isArray(data.tiers) ? data.tiers : [],
        });
      } catch {
        if (!isActive) {
          return;
        }
        setErrorMessage('Unable to load storefront data.');
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadStorefront();

    return () => {
      isActive = false;
    };
  }, [slug]);

  const handleBuy = async (tierId: string | undefined, productId: string | undefined) => {
    if (!tierId) {
      setErrorMessage('This tier is unavailable for checkout.');
      return;
    }

    setBuyingTierId(tierId);
    setErrorMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/v1/checkout/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tier_id: tierId,
          product_id: productId,
          customer_name: 'Demo Buyer',
          customer_email: 'buyer@example.com',
          customer_mobile: '081234567890',
        }),
      });

      if (!response.ok) {
        throw new Error('Checkout start failed.');
      }

      window.location.href = '/wait';
    } catch {
      setErrorMessage('Unable to start checkout. Please try again.');
    } finally {
      setBuyingTierId(null);
    }
  };

  return (
    <main className="bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white via-slate-50 to-slate-100 px-6 py-12 md:px-8 md:py-16">
      <div className="min-h-screen bg-white">
        <div className="mx-auto w-full max-w-7xl">
          <header className="mx-auto max-w-5xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-semibold tracking-[0.08em] text-slate-600 shadow-[0_12px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/80">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              <span>LunasAI Storefront</span>
              <span className="ml-2 flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h1 className="mx-auto mt-8 mb-6 max-w-4xl text-5xl font-black tracking-tighter text-slate-900 md:text-6xl">
              {storefront?.headline || `Storefront Preview for ${slug}`}
            </h1>
            <p className="mx-auto mb-12 max-w-3xl text-xl font-medium tracking-tight text-slate-600 leading-relaxed md:text-2xl">
              Clear positioning, elegant pricing, and a buyer path designed to convert without friction.
            </p>
          </header>

        {isLoading && (
          <div className="mx-auto max-w-3xl rounded-[28px] bg-white/90 p-10 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
            <p className="mt-3 text-sm font-medium text-slate-600">Loading storefront...</p>
          </div>
        )}

        {!isLoading && errorMessage && (
          <div className="mx-auto max-w-3xl rounded-[28px] bg-red-50 p-5 text-center shadow-[0_12px_30px_rgba(239,68,68,0.08)] ring-1 ring-red-100">
            <p className="text-sm font-semibold text-red-700">{errorMessage}</p>
          </div>
        )}

        {!isLoading && storefront && (
          <>
            {storefront.benefits.length > 0 && (
              <section className="mx-auto mt-20 mb-16 max-w-6xl">
                <div className="mx-auto mb-10 max-w-3xl text-center">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">What you get</p>
                  <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                    Built to feel premium before the first click on checkout.
                  </h2>
                </div>
                <div className="mb-20 grid grid-cols-1 gap-6 md:grid-cols-3">
                  {storefront.benefits.map((benefit, index) => {
                    const Icon = benefitIcons[index % benefitIcons.length];
                    const content = splitBenefitContent(benefit);

                    return (
                      <div
                        key={benefit}
                        className="rounded-2xl border border-slate-100 bg-slate-50/50 p-6 transition-all hover:bg-white hover:shadow-md"
                      >
                        <div className="mb-4 w-fit rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
                          <Icon className="h-5 w-5" />
                        </div>
                        <p className="text-base font-semibold tracking-tight text-slate-900">{content.title}</p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-500">
                          {content.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[0.95fr_1.1fr_0.95fr]">
              {storefront.tiers.map((tier, index) => (
                <article
                  key={`${tier.name}-${tier.tier_id ?? 'no-id'}`}
                  className={
                    index === 1
                      ? 'relative z-10 rounded-[32px] border border-slate-200 bg-white p-10 shadow-[0_0_50px_-12px_rgba(79,70,229,0.3)] shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_60px_-10px_rgba(79,70,229,0.36)] md:scale-105'
                      : 'rounded-[32px] border border-slate-200 bg-white p-10 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_70px_rgba(15,23,42,0.12)]'
                  }
                >
                  {index === 1 ? (
                    <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white shadow-lg shadow-indigo-200/60">
                      Most Popular
                    </div>
                  ) : null}
                  <div className="mb-8">
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">{tier.name}</h2>
                    <p
                      className={`mt-4 text-4xl font-extrabold tracking-tighter ${
                        index === 1 ? 'text-indigo-600' : 'text-slate-900'
                      }`}
                    >
                      Rp{Number(tier.price || 0).toLocaleString('id-ID')}
                    </p>
                    <p className="mt-5 min-h-20 text-[15px] leading-7 text-slate-600">{tier.description}</p>
                  </div>
                  <div className="mb-8 space-y-3">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                      Instant access after payment confirmation
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                      Secure delivery token and clean checkout flow
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleBuy(tier.tier_id, storefront.product_id);
                    }}
                    disabled={Boolean(buyingTierId)}
                    className={
                      index === 1
                        ? 'w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-4 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60'
                        : 'w-full rounded-2xl border border-slate-200 bg-white/80 px-6 py-4 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60'
                    }
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      {buyingTierId === tier.tier_id ? 'Starting Checkout...' : 'Buy Now'}
                      {buyingTierId !== tier.tier_id ? <ArrowRight className="h-4 w-4" /> : null}
                    </span>
                  </button>
                </article>
              ))}
            </section>
          </>
        )}
        </div>
      </div>
    </main>
  );
}
