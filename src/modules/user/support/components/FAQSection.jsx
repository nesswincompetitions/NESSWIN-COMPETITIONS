import React, { useEffect, useState, useMemo } from 'react';
import { ChevronDown, HelpCircle, Eye } from 'lucide-react';
import { fetchFaqs, incrementFaqViewCount } from '@/modules/user/support/services/faqService';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';
import { useTranslation } from 'react-i18next';

export default function FAQSection() {
  const { t } = useTranslation();
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState('all');
  const [openIds, setOpenIds] = useState(new Set());

  useEffect(() => {
    const loadFaqs = async () => {
      setLoading(true);
      const data = await fetchFaqs();
      setFaqs(data);
      setLoading(false);
    };
    loadFaqs();
  }, []);

  // Extract unique types for the filter tabs
  const types = useMemo(() => {
    const uniqueTypes = new Set(faqs.map(f => f.type || 'general'));
    return ['all', ...Array.from(uniqueTypes)];
  }, [faqs]);

  // Filter FAQs based on selected type
  const filteredFaqs = useMemo(() => {
    if (activeType === 'all') return faqs;
    return faqs.filter(f => (f.type || 'general') === activeType);
  }, [faqs, activeType]);

  const toggleFaq = (id) => {
    setOpenIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
        // Fire-and-forget: increment in Firestore without blocking UI
        incrementFaqViewCount(id);
        // Optimistic local update
        setFaqs(curr =>
          curr.map(faq =>
            faq.id === id
              ? { ...faq, view_count: (faq.view_count || 0) + 1 }
              : faq
          )
        );
      }
      return newSet;
    });
  };

  const formatTypeLabel = (type) => {
    if (type === 'all') return t('profile.support.faqAll', 'All');
    return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
  };

  if (loading) {
    return (
      <div className="py-10 flex justify-center">
        <LoadingSpinner fullScreen={false} size="w-6 h-6" message={t('profile.support.loadingFaqs', 'Loading FAQs...')} />
      </div>
    );
  }

  if (faqs.length === 0) return null;

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <HelpCircle className="w-4 h-4 text-[var(--color-primary)]" />
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--color-muted-foreground)]">FAQs</h2>
      </div>

      {/* Category Pills */}
      {types.length > 2 && (
        <div className="flex flex-wrap gap-1.5">
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all duration-200 border cursor-pointer ${
                activeType === type
                  ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                  : 'bg-transparent border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40'
              }`}
            >
              {formatTypeLabel(type)}
            </button>
          ))}
        </div>
      )}

      {/* Accordion Items */}
      <div className="space-y-1.5">
        {filteredFaqs.map((faq) => {
          const isOpen = openIds.has(faq.id);
          return (
            <div
              key={faq.id}
              className={`rounded-xl border transition-all duration-300 overflow-hidden ${
                isOpen
                  ? 'bg-[var(--color-card)] border-[var(--color-primary)]/30 shadow-lg shadow-primary/5'
                  : 'bg-[var(--color-card)] border-[var(--color-border)]/50 hover:border-[var(--color-border)]'
              }`}
            >
              <button
                onClick={() => toggleFaq(faq.id)}
                className="w-full text-left px-3.5 py-2.5 flex items-start justify-between gap-2 cursor-pointer focus:outline-none"
              >
                <span className={`text-[13px] leading-snug font-medium transition-colors ${
                  isOpen ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]'
                }`}>
                  {faq.question}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--color-primary)] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <div
                className={`grid transition-all duration-300 ease-in-out ${
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-3.5 pb-3 text-xs text-[var(--color-muted-foreground)] leading-relaxed border-t border-[var(--color-border)]/30 pt-2.5">
                    <p>{faq.answer}</p>
                    <div className="flex justify-end items-center gap-1 mt-2 text-[9px] uppercase tracking-widest text-[var(--color-muted-foreground)]/40">
                      <Eye className="w-2.5 h-2.5" />
                      <span>{faq.view_count || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
