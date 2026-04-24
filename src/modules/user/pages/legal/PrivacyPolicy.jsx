import React from 'react';
import { ShieldCheck } from 'lucide-react';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen pt-32 pb-24 bg-(--color-background)">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="mb-12 text-center space-y-4 fade-in">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_oklch(0.78_0.14_78/0.15)] border border-primary/20">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white tracking-tight">
            Privacy Policy
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
                <span className="text-primary text-xl">1.</span> Who We Are
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>This Privacy Policy explains how NESSWIN COMPETITIONS LTD (“Nesswin”, “we”, “us”, or “our”) collects, uses, stores, shares, and protects personal data when users access our website, app, web app, competitions, and related services (the “Platform”).</p>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5">
                  <p className="font-bold text-white mb-2">NESSWIN COMPETITIONS LTD</p>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500 w-36 inline-block">Company Number:</span> 17105471</p>
                    <p><span className="text-gray-500 w-36 inline-block">Registered Office:</span> 128 City Road, London, EC1V 2NX, United Kingdom</p>
                    <p><span className="text-gray-500 w-36 inline-block">Email:</span> <a href="mailto:support@nesswin.com" className="text-primary hover:underline">support@nesswin.com</a></p>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">2.</span> Scope
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>This Privacy Policy applies to all visitors, users, participants, customers, and winners who interact with the Platform, including when creating an account, entering competitions, making payments, submitting a Free Postal Entry, contacting support, or claiming a prize.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">3.</span> Personal Data We May Collect
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>We may collect identity data, contact data, account data, verification data, transaction data, competition data, winner data, technical data, and communications.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">4.</span> Why We Use Your Data
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>We use personal data to create and manage accounts, verify eligibility, process entries, run competitions, select winners, prevent fraud, verify winners, deliver prizes, communicate with users, comply with legal obligations, and improve the Platform.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">5.</span> Sharing Your Data
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>We may share data with payment processors, KYC providers, SMS providers, hosting and analytics providers, logistics partners, professional advisers, and authorities where legally required. We do not sell your personal data to third parties.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">6.</span> Your Rights
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Depending on applicable law, you may have rights to access, correct, delete, restrict, object, withdraw consent where applicable, request portability, and lodge a complaint with a relevant supervisory authority.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">7.</span> Contact
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>For privacy questions or requests, please contact us at:</p>
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

export default PrivacyPolicy;
