import Link from 'next/link';
import { ShieldCheck, Sparkles, TerminalSquare } from 'lucide-react';

const featureCards = [
  {
    title: '1. AI Architecture',
    description:
      'Describe the product once. The Magic Terminal turns it into copy, pricing, and a launch-ready storefront.',
    icon: TerminalSquare,
  },
  {
    title: '2. Frictionless Checkout',
    description:
      'Every offer routes buyers into a clean Mayar-powered payment flow without manual setup or page wrangling.',
    icon: Sparkles,
  },
  {
    title: '3. Secure Delivery',
    description:
      'Digital fulfillment stays protected with token-gated delivery and cryptographic download control built in.',
    icon: ShieldCheck,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-tighter text-slate-900">
            LunasAI
          </Link>
          <Link
            href="/create"
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-bold text-white transition-all hover:bg-slate-800"
          >
            Start Creating
          </Link>
        </div>
      </nav>

      <section className="bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-white to-white px-6 pt-20 pb-24 text-center">
        <div className="mx-auto flex min-h-[80vh] max-w-7xl flex-col items-center justify-center">
          <span className="mb-6 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-indigo-600">
            LunasAI Beta 1.0
          </span>
          <h1 className="max-w-5xl text-6xl font-black leading-[1.1] tracking-tighter text-slate-900 md:text-8xl">
            From Idea to Income in 60 Seconds.
          </h1>
          <p className="mt-6 mb-10 max-w-2xl text-xl font-medium tracking-tight text-slate-500 md:text-2xl">
            The first AI-agent platform that builds your storefront, handles Mayar payments, and
            secures your digital delivery.
          </p>
          <Link
            href="/create"
            className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-8 py-4 text-lg font-bold text-white shadow-[0_0_40px_-10px_rgba(124,58,237,0.5)] transition-all hover:scale-105"
          >
            Build Your Storefront — Free
          </Link>
          <p className="mt-4 text-xs font-medium italic text-slate-400">
            No credit card required. Launch in minutes.
          </p>

          <div className="relative mt-20 mx-auto w-full max-w-5xl group">
            <div className="absolute -inset-1 -z-10 rounded-[2.5rem] bg-gradient-to-r from-violet-600 to-indigo-600 blur-2xl opacity-20 transition duration-1000 group-hover:opacity-40"></div>

            <div className="relative aspect-[16/9] overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white/80 shadow-2xl ring-1 ring-slate-900/5 backdrop-blur-xl md:aspect-[21/9]">
              <div className="flex h-12 items-center gap-2 border-b border-slate-200/50 bg-white/50 px-6">
                <div className="h-3 w-3 rounded-full bg-slate-300"></div>
                <div className="h-3 w-3 rounded-full bg-slate-300"></div>
                <div className="h-3 w-3 rounded-full bg-slate-300"></div>
              </div>

              <div className="flex h-full items-start gap-8 bg-slate-50/50 p-8">
                <div className="hidden w-48 space-y-4 md:block">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Recent Stores
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="text-xs font-medium text-slate-700">Art Course v1.2</div>
                    <div className="text-xs font-medium text-slate-400">Tongkat Sakti</div>
                    <div className="text-xs font-medium text-slate-400">Ayam Potong Segar</div>
                  </div>
                </div>

                <div className="flex-1 space-y-6">
                  <div className="flex h-8 w-1/3 items-center rounded-lg bg-indigo-200">
                    <span className="px-3 text-[10px] font-bold text-indigo-700">
                      Storefront: Art Course v1.2
                    </span>
                  </div>
                  <div className="relative flex h-40 w-full flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl">
                    <div className="mb-2 text-[10px] text-slate-400">LunasAI Agent</div>
                    <div className="mb-1 font-mono text-xs text-indigo-300">
                      {`> Analyzing product description...`}
                    </div>
                    <div className="font-mono text-xs text-indigo-300">
                      {`> Generating bento-box pricing tiers...`}
                    </div>
                    <div className="absolute bottom-0 left-0 m-4 h-1 w-1/3 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 animate-pulse"></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="h-24 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[9px] font-bold uppercase text-slate-600">Live Now</span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">Accepting payments via Mayar</div>
                    </div>
                    <div className="h-24 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400">
                        Revenue
                      </div>
                      <div className="mt-1 text-sm font-black text-slate-900">$4,820.00</div>
                      <div className="text-[8px] text-slate-400">Total Revenue Generated</div>
                    </div>
                    <div className="h-24 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400">
                        Conversion
                      </div>
                      <div className="mt-1 text-sm font-black text-slate-900">12.4%</div>
                      <div className="mt-1 text-[10px] font-bold text-emerald-500">+2.1% this week</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-b from-white to-slate-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="mb-16 text-center text-4xl font-black tracking-tighter text-slate-900">
            Everything you need to sell digital products.
          </h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {featureCards.map((card) => {
              const Icon = card.icon;

              return (
                <div
                  key={card.title}
                  className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl"
                >
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900">{card.title}</h3>
                  <p className="mt-3 text-base leading-7 text-slate-600">{card.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-100 bg-white py-20">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-6 md:flex-row">
          <div className="flex flex-col gap-2">
            <span className="text-xl font-black tracking-tighter text-slate-900">LunasAI</span>
            <p className="text-xs text-slate-400">© 2026 LunasAI. All rights reserved.</p>
          </div>

          <div className="flex gap-8 text-xs font-bold uppercase tracking-widest text-slate-900">
            <span className="cursor-pointer hover:text-indigo-600">Terms</span>
            <span className="cursor-pointer hover:text-indigo-600">Privacy</span>
            <span className="cursor-pointer hover:text-indigo-600">Contact</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
