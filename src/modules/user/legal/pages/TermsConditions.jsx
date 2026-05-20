import React from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const TermsConditions = () => {
  const { t } = useTranslation('legal');

  const prizes = t('termsConditions.sections.natureOfPlatform.prizes', { returnObjects: true });
  const platformRules = t('termsConditions.sections.natureOfPlatform.rules', { returnObjects: true });
  const eligibilityReqs = t('termsConditions.sections.eligibility.requirements', { returnObjects: true });
  const accountFields = t('termsConditions.sections.accountRegistration.fields', { returnObjects: true });
  const usernameFields = t('termsConditions.sections.usernameDisplay.fields', { returnObjects: true });
  const ticketReqs = t('termsConditions.sections.ticketPurchases.requirements', { returnObjects: true });
  const paymentRules = t('termsConditions.sections.ticketPurchases.rules', { returnObjects: true });
  const fpeInfoFields = t('termsConditions.sections.freePostalEntry.infoFields', { returnObjects: true });
  const noRefundRules = t('termsConditions.sections.noRefund.rules', { returnObjects: true });
  const winnerSelReqs = t('termsConditions.sections.winnerSelection.requirements', { returnObjects: true });
  const winnerVerReqs = t('termsConditions.sections.winnerVerification.requirements', { returnObjects: true });
  const promoFields = t('termsConditions.sections.promotionalConsent.fields', { returnObjects: true });
  const chargebackRules = t('termsConditions.sections.chargebacks.rules', { returnObjects: true });

  return (
    <div className="min-h-screen pt-32 pb-24 bg-(--color-background)">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">
        
        {/* Header Section */}
        <div className="mb-12 text-center space-y-4 fade-in">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_oklch(0.78_0.14_78/0.15)] border border-primary/20">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white tracking-tight">
            {t('termsConditions.title')}
          </h1>
          <p className="text-gray-400 text-lg">
            {t('lastUpdated', { date: 'April 2026' })}
          </p>
        </div>

        {/* Content Container */}
        <div className="bg-[#0f0f0f] border border-white/5 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden fade-in-up">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
          
          <div className="relative z-10 space-y-12 text-gray-300 leading-relaxed text-[15px]">
            
            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.organiser.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.organiser.p1')}</p>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5">
                  <p className="font-bold text-white mb-2">{t('termsConditions.sections.organiser.compName')}</p>
                  <p className="text-sm text-gray-400 mb-4">{t('termsConditions.sections.organiser.compSub')}</p>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500 w-36 inline-block">{t('termsConditions.sections.organiser.compNumber')}</span> 17105471</p>
                    <p><span className="text-gray-500 w-36 inline-block">{t('termsConditions.sections.organiser.registeredOffice')}</span> 128 City Road, London, EC1V 2NX, United Kingdom</p>
                    <p><span className="text-gray-500 w-36 inline-block">{t('termsConditions.sections.organiser.email')}</span> <a href="mailto:support@nesswin.com" className="text-primary hover:underline">support@nesswin.com</a></p>
                  </div>
                </div>
                <p>{t('termsConditions.sections.organiser.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.natureOfPlatform.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.natureOfPlatform.p1')}</p>
                <ul className="list-none space-y-2">
                  {Array.isArray(prizes) && prizes.map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="pt-2">{t('termsConditions.sections.natureOfPlatform.p2')}</p>
                <p>{t('termsConditions.sections.natureOfPlatform.p3')}</p>
                <ul className="list-none space-y-2">
                  {Array.isArray(platformRules) && platformRules.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.eligibility.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.eligibility.description')}</p>
                <ul className="list-none space-y-2">
                  {Array.isArray(eligibilityReqs) && eligibilityReqs.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="pt-2">{t('termsConditions.sections.eligibility.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.accountRegistration.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.accountRegistration.description')}</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Array.isArray(accountFields) && accountFields.map((item, i) => (
                    <li key={i} className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-lg border border-white/5">
                      <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="pt-2 text-gray-400 bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-sm leading-relaxed">
                  <strong className="text-red-400 block mb-1">{t('termsConditions.sections.accountRegistration.warningTitle')}</strong>
                  {t('termsConditions.sections.accountRegistration.warningText')}
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.phoneVerification.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.phoneVerification.p1')}</p>
                <p>{t('termsConditions.sections.phoneVerification.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.usernameDisplay.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.usernameDisplay.description')}</p>
                <ul className="flex flex-wrap gap-2">
                  {Array.isArray(usernameFields) && usernameFields.map((item, i) => (
                    <li key={i} className="bg-primary/10 text-primary border border-primary/20 px-4 py-1.5 rounded-full text-sm font-medium">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.ticketPurchases.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.ticketPurchases.description')}</p>
                <ul className="list-none space-y-2">
                  {Array.isArray(ticketReqs) && ticketReqs.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5 mt-6">
                  <p className="font-bold text-white mb-3">{t('termsConditions.sections.ticketPurchases.ruleTitle')}</p>
                  <ul className="list-none space-y-2 text-sm text-gray-400">
                    {Array.isArray(paymentRules) && paymentRules.map((item, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0 mt-2" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="pt-2 text-sm text-gray-400 italic">{t('termsConditions.sections.ticketPurchases.postalDisclaimer')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.freePostalEntry.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.freePostalEntry.p1')}</p>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5 flex flex-col md:flex-row gap-6 items-start">
                  <div className="flex-1">
                    <p className="font-medium text-white mb-2">{t('termsConditions.sections.freePostalEntry.infoTitle')}</p>
                    <ul className="list-none space-y-1.5 text-sm text-gray-400">
                      {Array.isArray(fpeInfoFields) && fpeInfoFields.map((item, i) => (
                        <li key={i}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="md:w-px md:h-32 bg-white/10 hidden md:block" />
                  <div className="flex-1">
                    <p className="font-medium text-white mb-2">{t('termsConditions.sections.freePostalEntry.sendTo')}</p>
                    <p className="text-sm text-gray-400 font-mono bg-black/30 p-3 rounded-lg leading-relaxed whitespace-pre-line">
                      {t('termsConditions.sections.freePostalEntry.address')}
                    </p>
                  </div>
                </div>
                <p className="pt-2">{t('termsConditions.sections.freePostalEntry.p2')} <Link to="/free-postal-entry" className="text-primary hover:underline font-medium">{t('termsConditions.sections.freePostalEntry.learnMore')}</Link></p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.noRefund.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.noRefund.description')}</p>
                <ul className="list-none space-y-2">
                  {Array.isArray(noRefundRules) && noRefundRules.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.timing.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.timing.description')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.winnerSelection.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.winnerSelection.description')}</p>
                <ul className="list-none space-y-2">
                  {Array.isArray(winnerSelReqs) && winnerSelReqs.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-2" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="pt-2">{t('termsConditions.sections.winnerSelection.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.winnerNotification.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.winnerNotification.description')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.winnerVerification.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.winnerVerification.description')}</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Array.isArray(winnerVerReqs) && winnerVerReqs.map((item, i) => (
                    <li key={i} className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-lg border border-white/5">
                      <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                      <span className="text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.prizes.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.prizes.description')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.promotionalConsent.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.promotionalConsent.description')}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {Array.isArray(promoFields) && promoFields.map((item, i) => (
                    <span key={i} className="text-xs bg-white/5 border border-white/10 px-3 py-1.5 rounded-md text-gray-400">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.chargebacks.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.chargebacks.description')}</p>
                <ul className="list-none space-y-2">
                  {Array.isArray(chargebackRules) && chargebackRules.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-2" />
                      <span className="text-red-200/80">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.availability.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.availability.description')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.intellectualProperty.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.intellectualProperty.description')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.limitationOfLiability.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.limitationOfLiability.description')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.governingLaw.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.governingLaw.description')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('termsConditions.sections.contact.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('termsConditions.sections.contact.description')}</p>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5 inline-block">
                  <p className="font-bold text-white mb-2">{t('termsConditions.sections.contact.compName')}</p>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-gray-500 w-36 inline-block">{t('termsConditions.sections.contact.email')}</span> <a href="mailto:support@nesswin.com" className="text-primary hover:underline">support@nesswin.com</a></p>
                    <p><span className="text-gray-500 w-36 inline-block">{t('termsConditions.sections.contact.address')}</span></p>
                    <p><span className="text-gray-500 w-36 inline-block">{t('termsConditions.sections.contact.phone')}</span></p>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
};

export default TermsConditions;
