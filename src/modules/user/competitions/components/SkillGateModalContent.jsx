import { AlertTriangle, ShieldCheck, Sparkles, WifiOff } from 'lucide-react';
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';

export function SkillGateModalContent({
  gateStatus,
  isVerifying,
  activeQuestion,
  selectedOptionId,
  setSelectedOptionId,
  verifyError,
  handleVerifyAnswer,
  setIsModalOpen,
}) {
  // ── Loading ────────────────────────────────────────────────────────────────
  if (gateStatus === 'loading' || isVerifying) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <LoadingSpinner fullScreen={false} size="w-10 h-10" message={isVerifying ? 'Checking your answer...' : 'Loading secure challenge...'} />
      </div>
    );
  }

  // ── Admin misconfiguration: no questions set up ────────────────────────────
  if (gateStatus === 'no_questions') {
    return (
      <div className="py-12 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-dashed border-amber-500/20 flex items-center justify-center mx-auto">
          <WifiOff className="w-8 h-8 text-amber-400" />
        </div>
        <div className="space-y-1">
          <p className="text-white font-bold">Quiz Configuring</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            The skill question for this competition is being set up. Please try again later.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(false)}
          className="mt-4 px-8 py-3 rounded-xl bg-primary text-black text-sm font-bold hover:opacity-90 transition-all cursor-pointer"
        >
          Close
        </button>
      </div>
    );
  }

  // ── Quiz question ──────────────────────────────────────────────────────────
  if (activeQuestion) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Skill Question</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Unlimited attempts
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-linear-to-r from-primary/20 to-primary/5 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500" />
          <div className="relative bg-[#0A0A0A] border border-white/10 rounded-2xl overflow-hidden">
            {activeQuestion.images?.[0] && (
              <div className="relative h-32 sm:h-48 shrink-0">
                <img src={activeQuestion.images[0]} alt="Reference" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-linear-to-t from-[#0A0A0A] via-transparent to-transparent" />
              </div>
            )}

            <div className="p-5 sm:p-6 space-y-5">
              <h4 className="text-lg sm:text-xl font-serif font-bold text-white leading-tight">
                {activeQuestion.question}
              </h4>

              <div className="grid gap-3">
                {activeQuestion.option?.map((opt, idx) => {
                  const isSelected = selectedOptionId === opt.option_id;
                  return (
                    <button
                      key={opt.option_id || idx}
                      onClick={() => setSelectedOptionId(opt.option_id)}
                      className={`group/opt relative w-full text-left px-5 py-4 rounded-xl border transition-all duration-300 cursor-pointer ${isSelected
                        ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]'
                        : 'bg-white/[0.03] border-white/5 hover:border-white/20 hover:bg-white/[0.05]'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium transition-colors ${isSelected ? 'text-primary' : 'text-gray-300 group-hover/opt:text-white'}`}>
                          {opt.option}
                        </span>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary' : 'border-white/20 group-hover/opt:border-white/40'}`}>
                          {isSelected && <div className="w-2 h-2 bg-black rounded-full" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {verifyError && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {verifyError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 shrink-0">
          <button
            onClick={() => setIsModalOpen(false)}
            disabled={isVerifying}
            className="w-full sm:flex-1 px-6 py-3.5 rounded-xl border border-white/10 text-sm font-bold text-gray-400 hover:bg-white/5 disabled:opacity-50 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleVerifyAnswer}
            disabled={selectedOptionId === null || isVerifying}
            className="w-full sm:flex-[1.5] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-primary text-black text-sm font-black shadow-[0_8px_20px_-4px_rgba(var(--primary-rgb),0.3)] hover:opacity-90 disabled:opacity-50 disabled:grayscale transition-all active:scale-95 cursor-pointer"
          >
            {isVerifying ? <LoadingSpinner fullScreen={false} size="w-4 h-4" message="" /> : <ShieldCheck className="w-4 h-4" />}
            {isVerifying ? 'Verifying...' : 'Submit Answer'}
          </button>
        </div>
      </div>
    );
  }

  // ── Fallback (should not normally render) ──────────────────────────────────
  return null;
}
