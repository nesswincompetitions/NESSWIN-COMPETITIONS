import React from 'react';
import { HeartHandshake } from 'lucide-react';

const ResponsiblePlay = () => {
  return (
    <div className="min-h-screen pt-32 pb-24 bg-(--color-background)">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="mb-12 text-center space-y-4 fade-in">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_oklch(0.78_0.14_78/0.15)] border border-primary/20">
            <HeartHandshake className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white tracking-tight">
            Responsible Play (18+)
          </h1>
          <p className="text-gray-400 text-lg">
            Last updated: April 2026
          </p>
        </div>

        {/* Content Container */}
        <div className="bg-[#0f0f0f] border border-white/5 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden fade-in-up">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          
          <div className="relative z-10 space-y-12 text-gray-300 leading-relaxed text-[15px]">
            
            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">1.</span> 18+ Only
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Nesswin competitions are strictly for adults aged 18 or over. We may require age verification before allowing participation or before releasing a prize.</p>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border-4 border-red-500/20 bg-red-500/10 text-red-500 font-black text-2xl">
                  18+
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">2.</span> Play Responsibly
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Nesswin encourages all users to participate responsibly and within their financial means. Never spend more than you can comfortably afford to lose. Participation should always be for entertainment and excitement, not as a way to make money or solve financial problems.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">3.</span> Warning Signs
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>You should stop and seek support if you:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    'Spend more than intended',
                    'Feel pressure to chase losses or “win back” money',
                    'Hide your spending from family or friends',
                    'Use borrowed money or essential funds to enter competitions',
                    'Feel stressed, anxious, or out of control about participation'
                  ].map((item, i) => (
                    <div key={i} className="bg-red-500/5 border border-red-500/10 p-4 rounded-xl flex items-start gap-3">
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" />
                      <span className="text-gray-300">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">4.</span> Self-Exclusion / Support Requests
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>If you would like to restrict your access, request account limits, or ask us to block your participation, please contact us at:</p>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5 inline-block">
                  <p><span className="text-gray-500 mr-2">Email:</span> <a href="mailto:support@nesswin.com" className="text-primary hover:underline font-medium">support@nesswin.com</a></p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">5.</span> Contact
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>For responsible play or account restriction requests, please reach out to:</p>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5 inline-block">
                  <p><span className="text-gray-500 mr-2">Email:</span> <a href="mailto:support@nesswin.com" className="text-primary hover:underline font-medium">support@nesswin.com</a></p>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
};

export default ResponsiblePlay;
