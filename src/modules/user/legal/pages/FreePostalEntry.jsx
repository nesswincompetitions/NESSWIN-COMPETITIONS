import React from 'react';
import { Mail } from 'lucide-react';

const FreePostalEntry = () => {
  return (
    <div className="min-h-screen pt-32 pb-24 bg-(--color-background)">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="mb-12 text-center space-y-4 fade-in">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_oklch(0.78_0.14_78/0.15)] border border-primary/20">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white tracking-tight">
            Free Postal Entry Policy
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
                <span className="text-primary text-xl">1.</span> Overview
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Nesswin offers a free alternative method of entry by post (“Free Postal Entry”) for eligible competitions, subject to the Terms & Conditions and any competition-specific rules shown on the relevant competition page.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">2.</span> Eligibility
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>To submit a valid Free Postal Entry, the participant must:</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {['Be aged 18 or over', 'Meet all general eligibility requirements', 'Have a registered Nesswin account (unless stated)', 'Have a verified mobile phone number', 'Correctly answer the skill question (if required)', 'Ensure entry is received before deadline'].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 bg-white/5 px-4 py-3 rounded-lg border border-white/5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span className="text-sm font-medium">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">3.</span> How to Enter
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Send a handwritten postcard or handwritten letter containing:</p>
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-3">
                    {['Full legal name', 'Full residential address', 'Mobile phone number (linked to account)', 'Registered email address', 'Nesswin username (if applicable)', 'Exact competition name/reference', 'Correct answer to the skill question'].map((item, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0 mt-2" />
                        <span className="text-gray-300">{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1">
                    <div className="bg-primary/5 p-6 rounded-2xl border border-primary/20 sticky top-24">
                      <p className="font-bold text-primary mb-3 text-sm uppercase tracking-wider">Send To Address</p>
                      <p className="text-white font-mono text-sm leading-relaxed">
                        NESSWIN COMPETITIONS LTD<br/>
                        128 City Road<br/>
                        London, EC1V 2NX<br/>
                        United Kingdom
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">4.</span> Equal Chance of Winning
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>A valid Free Postal Entry that complies with the rules will be treated as a valid competition entry and included in the same draw as valid paid entries. Each valid Free Postal Entry has the same chance of winning as a valid paid entry.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">5.</span> Contact
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>For questions relating to Free Postal Entry, please contact us at:</p>
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

export default FreePostalEntry;
