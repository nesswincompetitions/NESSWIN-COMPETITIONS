import React from 'react';
import { ShieldAlert } from 'lucide-react';

const CompetitionRules = () => {
  return (
    <div className="min-h-screen pt-32 pb-24 bg-(--color-background)">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">

        {/* Header Section */}
        <div className="mb-12 text-center space-y-4 fade-in">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_oklch(0.78_0.14_78/0.15)] border border-primary/20">
            <ShieldAlert className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white tracking-tight">
            Competition Rules
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
                <span className="text-primary text-xl">1.</span> General Overview
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>These Competition Rules apply to all skill-based competitions operated by NESSWIN COMPETITIONS LTD, unless specific rules on a competition page state otherwise.</p>
                <p>By entering a competition, you agree to these Competition Rules, the Nesswin Terms & Conditions, and any prize-specific conditions shown on the relevant competition page.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">2.</span> How It Works
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>To enter a competition:</p>
                <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                  <ol className="relative border-l border-white/10 ml-3 space-y-6">
                    {[
                      'Create or log in to your account',
                      'Verify your phone number by SMS / OTP',
                      'Answer the skill-based qualifying question correctly',
                      'Choose your number of tickets',
                      'Complete payment successfully'
                    ].map((step, index) => (
                      <li key={index} className="ml-6">
                        <span className="absolute flex items-center justify-center w-6 h-6 bg-primary/20 rounded-full -left-3 ring-4 ring-[#0f0f0f] text-primary text-xs font-bold">
                          {index + 1}
                        </span>
                        <p className="font-medium text-white pt-0.5">{step}</p>
                      </li>
                    ))}
                  </ol>
                </div>
                <p className="text-gray-400 text-sm italic">Your entry only becomes valid once the payment is successful and the entry is correctly recorded in Nesswin’s systems.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">3.</span> Skill-Based Qualifying Question
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Every competition requires 1 skill-based qualifying question only. The question may be multiple choice, text-based, or image-based. For example, the user may see an image first and then choose the correct answer from 4 answer options.</p>
                <p>Nesswin may maintain an internal pool of multiple qualifying questions and may display one question randomly from that pool. This means different users may see different questions. Only users who answer the applicable question correctly may proceed to ticket purchase.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">4.</span> Ticket Purchases
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Once the user answers the question correctly, they may purchase one or more tickets, subject to availability and any applicable limits. Tickets are only valid after successful payment.</p>
                <p>All purchases are final unless the competition is cancelled by Nesswin or a refund is required by law.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">5.</span> Competition Closing
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>A competition will usually close when all tickets are sold out or when the stated closing date/time is reached. Nesswin may reasonably extend, shorten, suspend, or cancel a competition for technical, security, legal, compliance, operational, fraud prevention, or force majeure reasons.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">6.</span> Winner Selection
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>At the end of a competition, Nesswin will review all entries and identify all Valid Entries. A Valid Entry is one that answered the qualifying question correctly, completed successful payment, and complied with the applicable rules.</p>
                <p>Unless otherwise stated on the relevant competition page, the winner is selected randomly from the pool of valid entries that answered correctly.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">7.</span> Random Draw / RandomDraws-Type System
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>To support fairness and transparency, Nesswin may use a third-party random draw tool or platform, including a platform of the type commonly known as RandomDraws, or another equivalent system selected by Nesswin.</p>
                <p>Nesswin may retain screenshots, certificates, recordings, or evidence of the draw. Nesswin reserves the right to change the third-party tool used, provided the process remains fair and consistent with the competition rules.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">8.</span> Live Draws and Instagram Transparency
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>For transparency and trust, Nesswin may present the draw live on the official Nesswin Instagram account, via Instagram Live, or through another official Nesswin channel.</p>
                <p>During or around the draw, Nesswin may display participant usernames, first names + last initials, ticket quantities, the eligible participant list, and the draw process itself. Nesswin may also upload replay videos, winner announcement clips, draw recordings, and prize handover videos.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">9.</span> Winner Contact and Verification
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Winners may be contacted by email, SMS, phone, in-app notification, or another reasonable method.</p>
                <p>Before a prize is awarded, the winner may be required to provide ID, proof of age, proof of address, proof of ownership or authorisation for the payment method used, confirmation of phone verification, and any additional documents reasonably required for security, fraud prevention, KYC/AML, or compliance. Failure to provide requested documents may result in disqualification and selection of an alternative winner.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">10.</span> Prize Delivery / Handover
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Prize fulfilment depends on the type of prize and may include physical delivery, in-person collection, prize handover filming, direct booking via a travel provider, digital delivery, or another reasonable fulfilment method.</p>
                <p>Timing is not guaranteed and may depend on the prize type, winner location, supplier availability, logistics, compliance checks, taxes/customs, and third-party providers.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">11.</span> Winner Publicity and Prize Handover Content
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>If you win, Nesswin may, for transparency and promotional purposes, use content related to the winner announcement, the draw, prize handover, prize receipt, photos, videos, testimonials, social media posts, and promotional clips.</p>
                <p>Where reasonably possible, Nesswin may choose to show your username, first name, or first name + last initial instead of your full legal name. Nesswin may publish such content on the website, app/web app, Instagram, Facebook, TikTok, YouTube, X (Twitter), paid or organic advertising, and PR or marketing materials.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">12.</span> Important Restrictions
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Nesswin may disqualify or cancel entries where it reasonably believes there has been fraud, multiple abusive accounts, false identity, false documents, unauthorised payment use, bots or scripts, manipulation attempts, chargeback abuse, breach of rules, abusive conduct, or legal non-compliance.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">13.</span> Final Decisions
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>Nesswin’s decisions regarding question validity, entry validity, winner eligibility, draw method, prize fulfilment, disqualification, and operational integrity are final, except in the case of manifest error.</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                <span className="text-primary text-xl">14.</span> Contact
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>For questions regarding a competition:</p>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5 inline-block">
                  <p className="font-bold text-white mb-2">NESSWIN COMPETITIONS LTD</p>
                  <p><span className="text-gray-500 mr-2">Email:</span> <a href="mailto:Nesswincompetitions@gmail.com" className="text-primary hover:underline font-medium">Nesswincompetitions@gmail.com</a></p>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
};

export default CompetitionRules;
