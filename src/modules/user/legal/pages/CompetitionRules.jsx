import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const CompetitionRules = () => {
  const { t } = useTranslation('legal');
  const steps = t('competitionRules.sections.howItWorks.steps', { returnObjects: true });

  return (
    <div className="min-h-screen pt-32 pb-24 bg-(--color-background)">
      <div className="max-w-4xl mx-auto px-6 lg:px-8">

        {/* Header Section */}
        <div className="mb-12 text-center space-y-4 fade-in">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_oklch(0.78_0.14_78/0.15)] border border-primary/20">
            <ShieldAlert className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white tracking-tight">
            {t('competitionRules.title')}
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
                {t('competitionRules.sections.overview.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.overview.p1')}</p>
                <p>{t('competitionRules.sections.overview.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.howItWorks.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.howItWorks.description')}</p>
                <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                  <ol className="relative border-l border-white/10 ml-3 space-y-6">
                    {Array.isArray(steps) && steps.map((step, index) => (
                      <li key={index} className="ml-6">
                        <span className="absolute flex items-center justify-center w-6 h-6 bg-primary/20 rounded-full -left-3 ring-4 ring-[#0f0f0f] text-primary text-xs font-bold">
                          {index + 1}
                        </span>
                        <p className="font-medium text-white pt-0.5">{step}</p>
                      </li>
                    ))}
                  </ol>
                </div>
                <p className="text-gray-400 text-sm italic">{t('competitionRules.sections.howItWorks.footerNotice')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.qualifyingQuestion.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.qualifyingQuestion.p1')}</p>
                <p>{t('competitionRules.sections.qualifyingQuestion.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.ticketPurchases.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.ticketPurchases.p1')}</p>
                <p>{t('competitionRules.sections.ticketPurchases.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.closing.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.closing.description')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.winnerSelection.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.winnerSelection.p1')}</p>
                <p>{t('competitionRules.sections.winnerSelection.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.randomDraw.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.randomDraw.p1')}</p>
                <p>{t('competitionRules.sections.randomDraw.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.liveDraws.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.liveDraws.p1')}</p>
                <p>{t('competitionRules.sections.liveDraws.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.winnerContact.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.winnerContact.p1')}</p>
                <p>{t('competitionRules.sections.winnerContact.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.prizeDelivery.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.prizeDelivery.p1')}</p>
                <p>{t('competitionRules.sections.prizeDelivery.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.winnerPublicity.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.winnerPublicity.p1')}</p>
                <p>{t('competitionRules.sections.winnerPublicity.p2')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.restrictions.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.restrictions.description')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.finalDecisions.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.finalDecisions.description')}</p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3">
                {t('competitionRules.sections.contact.title')}
              </h2>
              <div className="pl-0 md:pl-9 space-y-4">
                <p>{t('competitionRules.sections.contact.description')}</p>
                <div className="bg-white/5 p-5 rounded-xl border border-white/5 inline-block">
                  <p className="font-bold text-white mb-2">{t('competitionRules.sections.contact.compName')}</p>
                  <p><span className="text-gray-500 mr-2">{t('competitionRules.sections.contact.email')}</span> <a href="mailto:Nesswincompetitions@gmail.com" className="text-primary hover:underline font-medium">Nesswincompetitions@gmail.com</a></p>
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
