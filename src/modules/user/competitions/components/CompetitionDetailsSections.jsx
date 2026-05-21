import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Clock,
  Lock,
  LogIn,
  Video,
  Users,
  ShieldCheck,
  Ticket,
  Sparkles,
  ShoppingCart,
  CheckCircle,
  AlertTriangle,
  Gift,
  Tag,
  Play,
  ArrowDown,
  MessageSquare,
  Star,
  Quote,
  Trophy,
} from "lucide-react";
import LoadingSpinner from '@/shared/components/ui/LoadingSpinner';
import { FaInstagram } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/state/AuthContext';
import { useUserData } from '@/contexts/UserContext';
import { m as motion, AnimatePresence } from 'framer-motion';

export const Confetti = () => {
  const particles = Array.from({ length: 40 });
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((_, i) => (
        <motion.div
          key={i}
          initial={{
            top: "50%",
            left: "50%",
            scale: 0,
            rotate: 0,
            opacity: 1
          }}
          animate={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            scale: Math.random() * 1.5,
            rotate: Math.random() * 360,
            opacity: 0
          }}
          transition={{
            duration: 2 + Math.random() * 2,
            ease: "easeOut",
            delay: Math.random() * 0.5
          }}
          className="absolute w-2 h-2 rounded-sm"
          style={{
            backgroundColor: ['#f9ce34', '#ee2a7b', '#6228d7', '#FFD700', '#FFFFFF'][Math.floor(Math.random() * 5)]
          }}
        />
      ))}
    </div>
  );
};

export function Breadcrumb({ title, fromSearch = "" }) {
  const { t } = useTranslation();
  return (
    <nav
      className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
      aria-label="Breadcrumb"
    >
      <Link
        to={`/competitions${fromSearch}`}
        className="flex items-center gap-1.5 hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {t("competitionDetails.competitions")}
      </Link>
      <span aria-hidden="true">/</span>
      <span className="text-(--color-foreground) truncate max-w-50">{title}</span>
    </nav>
  );
}

export function ImageGallery({ images, title, status, endsAt }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const isReadyToDraw = status === "ready_to_draw";
  const isDrawing = status === "drawing";
  const isSoldOut = status === "sold_out";
  const isWinnerAnnounced = status === "winner_announced";
  const isEnded = status === "end" || status === "completed" || isWinnerAnnounced;
  const isClosed = isReadyToDraw || isDrawing || isSoldOut || isEnded;
  const isActive = status === "active";

  return (
    <div className="space-y-3">
      <div className="relative aspect-4/3 rounded-2xl overflow-hidden">
        <img src={images[active]} alt={title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-black/30 to-transparent" />
        <span
          className={`absolute top-4 left-4 inline-flex items-center justify-center rounded-md border border-transparent px-2 py-0.5 text-xs font-medium tracking-wider uppercase ${(isClosed || isEnded)
            ? "bg-red-500 text-white"
            : "bg-primary text-(--color-primary-foreground)"
            }`}
        >
          {isActive
            ? t("common.active")
            : isSoldOut
              ? t("common.soldOut")
              : t("common.ended")}
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {images.map((src, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${active === i
              ? "border-primary shadow-[0_0_10px_oklch(0.78_0.14_78/0.4)]"
              : "border-transparent opacity-60 hover:opacity-100"
              }`}
          >
            <img src={src} alt="" className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function WhatsIncluded({ items }) {
  const { t } = useTranslation();

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-5">
      <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
        {t("competitionDetails.whatsIncluded")}
      </h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm">
            <CircleCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <span className="text-(--color-foreground)">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}


// ─── SelectTicketPanel ────────────────────────────────────────────────────────

/**
 * SelectTicketPanel
 *
 * Hybrid ticket selection UI with two distinct areas:
 *   1. "Claim Free Referral Tickets" — visible only when pendingReferralCount > 0
 *   2. "Purchase Ticket Packs"       — individual qty + pack cards
 *
 * Real-time summary bar: Paid + Referral + Bonus = Total
 * Zero-payment guard: if totalAmount === 0, CTA becomes "Claim Free Tickets"
 */
function SelectTicketPanel({
  ticketPrice,
  paidQty,
  setPaidQty,
  referralQty,
  setReferralQty,
  pendingReferralCount,
  bonusTickets,
  totalTickets,
  totalAmount,
  subtotal,
  discountAmt,
  isZeroPayment,
  isProcessing,
  checkoutError,
  onSubmit,
}) {
  const { t } = useTranslation();

  const PACKS = [
    { id: 'prestige', name: 'Pack Prestige', tickets: 15, discount: 10, popular: false },
    { id: 'elite', name: 'Pack Elite', tickets: 20, discount: 15, popular: false },
    { id: 'gold', name: 'Pack Gold', tickets: 25, discount: 20, popular: true },
    { id: 'diamond', name: 'Pack Diamond', tickets: 50, discount: 25, popular: false },
  ];

  return (
    <div className="space-y-6">
      {/* ── REWARD BANNER ────────────────────────────────────────────────── */}
      {pendingReferralCount > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-3 group animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] font-black text-primary uppercase tracking-widest">
              Reward Available!
            </p>
            <p className="text-[10px] text-primary/70 font-bold">
              You have {pendingReferralCount} free ticket{pendingReferralCount > 1 ? 's' : ''} to claim.
            </p>
          </div>
        </div>
      )}

      {/* ── AREA 1: Referral tickets ──────────────────────────────────────── */}
      {pendingReferralCount > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Ticket className="w-3.5 h-3.5 text-primary" />
            Claim Free Referral Tickets
          </p>

          <div className="flex flex-wrap gap-2">
            {Array.from({ length: pendingReferralCount }, (_, i) => i + 1).map((num) => {
              const isActive = referralQty === num;
              return (
                <button
                  key={num}
                  onClick={() => setReferralQty(num)}
                  aria-pressed={isActive}
                  className={`w-11 h-12 rounded-xl border font-black text-sm transition-all duration-200 cursor-pointer ${isActive
                      ? 'bg-primary/20 border-primary text-primary shadow-[0_0_14px_rgba(var(--primary-rgb),0.2)]'
                      : 'bg-white/3 border-white/5 text-muted-foreground hover:border-white/20 hover:text-white'
                    }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── AREA 2: Purchase Ticket Packs ─────────────────────────────────── */}
      <div className="space-y-4">
        {/* Bonus notice */}
        <div className="bg-[#0A1A14] border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-[11px] font-bold text-emerald-400 leading-tight">
            {t('competitionDetails.buy10Get1Free')}
          </p>
        </div>

        {/* Individual qty selector (1–10) */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Ticket className="w-3.5 h-3.5 text-primary" />
            {t('competitionDetails.individualTickets')}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
              const isActive = paidQty === num;
              return (
                <button
                  key={num}
                  onClick={() => setPaidQty(num)}
                  className={`h-12 rounded-xl border font-bold text-sm transition-all duration-200 cursor-pointer ${isActive
                      ? 'bg-primary/20 border-primary text-primary shadow-[0_0_14px_rgba(var(--primary-rgb),0.2)]'
                      : 'bg-white/3 border-white/5 text-muted-foreground hover:border-white/20 hover:text-white'
                    }`}
                >
                  {num}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pack cards */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/40" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {t('competitionDetails.advantageousPacks')}
            </span>
            <div className="h-px flex-1 bg-border/40" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PACKS.map((pack) => {
              const isActive = paidQty === pack.tickets;
              const rawPrice = pack.tickets * ticketPrice * (1 - pack.discount / 100);
              // Show decimals only if not a whole number, or always show 2 for consistency?
              // User said "if applicable", so let's show up to 2 decimals.
              const packPrice = rawPrice % 1 === 0 ? rawPrice.toFixed(0) : rawPrice.toFixed(2);
              return (
                <button
                  key={pack.id}
                  onClick={() => setPaidQty(pack.tickets)}
                  className={`relative p-4 rounded-2xl border text-left transition-all duration-300 cursor-pointer group ${isActive
                      ? 'bg-primary/5 border-primary shadow-[0_0_28px_rgba(var(--primary-rgb),0.12)]'
                      : 'bg-white/2 border-white/5 hover:border-white/15'
                    }`}
                >
                  {pack.popular && (
                    <div className="absolute -top-px -right-px px-2.5 py-1 bg-primary rounded-bl-xl rounded-tr-2xl">
                      <span className="text-[8px] font-black text-black uppercase tracking-tighter">
                        {t('common.popular')}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1">
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-[9px] font-bold border ${isActive ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-white/10 text-muted-foreground'
                      }`}>
                      -{pack.discount}%
                    </span>
                    <p className="text-sm font-bold text-white pt-1">{pack.name}</p>
                    <p className="text-xs text-muted-foreground">{pack.tickets} {t('common.tickets')}</p>
                    <p className="text-lg font-black text-primary pt-0.5">{packPrice} €</p>
                  </div>
                  {isActive && (
                    <div className="absolute inset-0 rounded-2xl border-2 border-primary/40 animate-pulse pointer-events-none" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── REAL-TIME SUMMARY BAR ─────────────────────────────────────────── */}
      <div className="bg-white/2 border border-white/8 rounded-2xl overflow-hidden">
        {/* Ticket breakdown strip */}
        <div className={`grid divide-x divide-white/5 border-b border-white/5 ${pendingReferralCount > 0 ? 'grid-cols-3' : 'grid-cols-2'
          }`}>
          {[
            { label: 'Paid', value: paidQty, color: 'text-primary' },
            ...(pendingReferralCount > 0 ? [{ label: 'Referral', value: referralQty, color: 'text-emerald-400' }] : []),
            { label: 'Bonus', value: bonusTickets, color: 'text-amber-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="py-3 text-center">
              <p className={`text-xl font-black tabular-nums ${color}`}>{value}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Total tickets + price */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground font-medium">
              Total Tickets
            </span>
            <span className="font-black text-white">{totalTickets} {t('common.tickets')}</span>
          </div>

          {discountAmt > 0 && (
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <Tag className="w-3.5 h-3.5" />
                <span className="font-bold">{t('common.discount')}</span>
              </div>
              <span className="font-bold text-emerald-400">-{discountAmt.toFixed(2)} €</span>
            </div>
          )}

          {bonusTickets > 0 && (
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-1.5 text-amber-400">
                <Gift className="w-3.5 h-3.5" />
                <span className="font-bold">{t('competitionDetails.bonusTickets')}</span>
              </div>
              <span className="font-bold text-amber-400">+{bonusTickets} {t('common.free')} 🎁</span>
            </div>
          )}

          {referralQty > 0 && (
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <Gift className="w-3.5 h-3.5" />
                <span className="font-bold">Referral Tickets</span>
              </div>
              <span className="font-bold text-emerald-400">+{referralQty} Free 🎫</span>
            </div>
          )}

          <div className="h-px bg-white/5" />

          {/* Grand total row */}
          <div className="flex justify-between items-center">
            <span className="text-base font-black text-white uppercase tracking-wide">{t('common.total')}</span>
            {referralQty > 0 && paidQty === 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">FREE</span>
                <span className="text-2xl font-black text-emerald-400">0.00 €</span>
              </div>
            ) : (
              <span className={`text-2xl font-black ${totalAmount === 0 ? 'text-muted-foreground' : 'text-primary'}`}>
                {totalAmount.toFixed(2)} €
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Error message ─────────────────────────────────────────────────── */}
      {checkoutError && (
        <div className="flex items-start gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{checkoutError}</span>
        </div>
      )}

      {/* ── CTA Button (Zero-Payment Guard) ───────────────────────────────── */}
      <button
        id="checkout-submit-btn"
        onClick={onSubmit}
        disabled={isProcessing}
        className={`group/btn relative w-full h-16 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 cursor-pointer ${(referralQty > 0 && paidQty === 0)
            ? 'bg-emerald-500'
            : 'bg-primary'
          }`}
      >
        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
        <div className="relative flex items-center justify-center gap-3">
          {isProcessing ? (
            <LoadingSpinner fullScreen={false} size="w-5 h-5" message={null} />
          ) : (referralQty > 0 && paidQty === 0) ? (
            <Gift className="w-5 h-5 text-black" />
          ) : (
            <ShoppingCart className="w-5 h-5 text-black" />
          )}
          <span className="text-base font-black text-black uppercase tracking-widest">
            {isProcessing
              ? t('common.processing')
              : (referralQty > 0 && paidQty === 0)
                ? 'Claim Free Tickets'
                : t('competitionDetails.proceedToPayment')}
          </span>
        </div>
      </button>
    </div>
  );
}

// ─── TicketPurchaseCard ───────────────────────────────────────────────────────

export function TicketPurchaseCard({
  competition,
  skillPassed,
  // useCheckout-driven props
  paidTicketQty,
  setPaidTicketQty,
  referralTicketsToUse,
  setReferralTickets,
  bonusTickets,
  totalTickets,
  totalAmount,
  subtotal,
  discountAmt,
  isZeroPayment,
  onSubmitOrder,
  isProcessing,
  orderResult,
  onBuyMore,
  checkoutError,
  userHasTickets,
  userTickets,
  onViewAllTickets,
  // legacy compat (used by smart participate button)
  pendingReferralCount,
}) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { userData } = useUserData();
  const {
    sold,
    total,
    status,
    endsAt,
    title,
    images,
    ticketPrice,
  } = competition;

  const isReadyToDraw = status === "ready_to_draw";
  const isDrawing = status === "drawing";
  const isSoldOut = status === "sold_out";
  const isWinnerAnnounced = status === "winner_announced";
  const isEnded = status === "end" || status === "completed" || isWinnerAnnounced;
  const isActive = status === "active";
  const isClosed = isReadyToDraw || isDrawing || isSoldOut || isEnded;
  const remaining = total - sold;
  const progress = Math.min(100, Math.round((sold / total) * 100));

  return (
    <div className="rounded-3xl border border-border/60 bg-card overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.10)]">
      <div className="relative h-36 overflow-hidden">
        <img src={images[0]} alt={title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-linear-to-t from-card via-card/50 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-r from-black/10 via-transparent to-black/10" />
        <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-primary/80 font-bold mb-0.5">
              {t("competitionDetails.yourPrize")}
            </p>
            <p className="font-serif text-[15px] font-bold text-(--color-foreground) leading-snug line-clamp-1">
              {title}
            </p>
          </div>
          <div className="bg-primary text-(--color-primary-foreground) text-xs font-black px-3 py-1.5 rounded-full shadow-lg tracking-wide shrink-0 ml-2">
            {ticketPrice} € {t("competitionDetails.perTicket")}
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Your Tickets - Visible only for active competitions */}
        {currentUser && userTickets.length > 0 && status === 'active' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Ticket className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest">Your Tickets</span>
              </div>
              <button
                onClick={onViewAllTickets}
                className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline cursor-pointer"
              >
                View All ({userTickets.length})
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {userTickets.slice(0, 4).map((tk) => (
                <div key={tk.id} className="h-10 rounded-lg bg-white/3 border border-white/5 flex items-center justify-center">
                  <span className="text-[10px] font-mono font-bold text-muted-foreground">{tk.ticket_sequence}</span>
                </div>
              ))}
              {userTickets.length > 4 && (
                <button onClick={onViewAllTickets} className="h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-all">
                  <span className="text-[10px] font-bold text-primary">+{userTickets.length - 4} more</span>
                </button>
              )}
            </div>
            <div className="h-px bg-border/40" />
          </div>
        )}
        {!currentUser ? (
          <>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto shadow-[0_0_20px_oklch(0.78_0.14_78/0.2)]">
                <Lock className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-serif font-bold text-lg text-(--color-foreground)">
                {t("competitionDetails.loginToJoin")}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("competitionDetails.loginSubtitle")}
              </p>
            </div>

            <Link
              to="/signin"
              className="inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-medium h-9 px-4 bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              {t("competitionDetails.signIn")}
            </Link>
          </>
        ) : (currentUser && userData && (!userData.is_verified || !userData.date_of_birth || !userData.user_name)) ? (
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <AlertTriangle className="w-5 h-5 text-amber-500" aria-hidden="true" />
            </div>
            <h3 className="font-serif font-bold text-lg text-(--color-foreground)">
              Verification Required
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Please complete your account setup, age verification, and phone verification to participate.
            </p>
            <Link
              to="/onboarding"
              className="inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-semibold h-10 px-4 bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
              Complete Verification
            </Link>
          </div>
        ) : orderResult ? (
          <div className="text-center space-y-4 py-2">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(16,185,129,0.2)]">
              <CheckCircle className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-lg text-(--color-foreground)">Tickets Purchased!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {orderResult.tickets.length} ticket{orderResult.tickets.length > 1 ? "s" : ""} confirmed
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {orderResult.tickets.map((tk) => (
                <span key={tk.ticketId} className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-mono font-bold text-primary">
                  {tk.ticketSequence}
                </span>
              ))}
            </div>
            <div className="text-xs text-muted-foreground pt-2 border-t border-border/40 mt-3">
              Total: <span className="font-bold text-primary">{orderResult.totalAmount} €</span> · Order #{orderResult.orderId.slice(0, 8)}
            </div>
            {competition.status === 'active' && onBuyMore && (
              <button
                onClick={onBuyMore}
                className="inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-semibold h-10 px-4 bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-all cursor-pointer mt-2"
              >
                <ShoppingCart className="w-4 h-4" aria-hidden="true" />
                {t('common.buyMoreTickets')}
              </button>
            )}
          </div>
        ) : ((skillPassed || competition.gateStatus === 'eligible') && !isClosed && isActive) ? (
          <div className="space-y-5">

            {/* Hybrid ticket selection panel */}
            <SelectTicketPanel
              ticketPrice={ticketPrice}
              paidQty={paidTicketQty}
              setPaidQty={setPaidTicketQty}
              referralQty={referralTicketsToUse}
              setReferralQty={setReferralTickets}
              pendingReferralCount={pendingReferralCount}
              bonusTickets={bonusTickets}
              totalTickets={totalTickets}
              totalAmount={totalAmount}
              subtotal={subtotal}
              discountAmt={discountAmt}
              isZeroPayment={isZeroPayment}
              isProcessing={isProcessing}
              checkoutError={checkoutError}
              onSubmit={onSubmitOrder}
            />
          </div>
        ) : (
          <div className="text-center py-2">
            {!isActive && (
              <div className="space-y-4">
                 <div className={`px-4 py-3 border rounded-xl text-sm font-semibold ${isSoldOut ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                  {isSoldOut ? t('competitionDetails.statusAlerts.soldOut') : t('competitionDetails.statusAlerts.ended')}
                </div>
              </div>
            )}

            {isActive && (() => {
              const isDisabled = competition.gateStatus === 'loading';

              let icon, label;
              if (competition.gateStatus === 'loading') {
                icon = <LoadingSpinner fullScreen={false} size="w-4 h-4" message={null} />;
                label = 'Checking eligibility...';
              } else if (userHasTickets) {
                icon = <ShoppingCart className="w-4 h-4" aria-hidden="true" />;
                label = t('common.buyMoreTickets');
              } else {
                icon = <Ticket className="w-4 h-4" aria-hidden="true" />;
                label = t('common.participate');
              }

              return (
                <button
                  onClick={competition.onParticipate}
                  disabled={isDisabled}
                  className="inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-semibold h-10 px-4 bg-primary text-(--color-primary-foreground) hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  {icon}
                  {label}
                </button>
              );
            })()}
          </div>
        )}

        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span>{isActive ? t("competitionDetails.left") : "Tickets Sold"}</span>
            </div>
            <div className="text-white">
              <span className="text-primary">{(isActive ? remaining : sold).toLocaleString()}</span>
              <span className="text-muted-foreground opacity-50"> / {total.toLocaleString()}</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/5 border border-white/5 overflow-hidden p-px">
            <div
              className="h-full bg-linear-to-r from-primary via-primary to-primary/80 rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${progress}%`,
                boxShadow: progress > 0 ? "0 0 15px rgba(var(--primary-rgb),0.4)" : "none",
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 bg-muted/20 rounded-xl p-3">
            <Video className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t("competitionDetails.liveNote")}
            </p>
          </div>

        </div>

        <div className="text-center pt-1 border-t border-border/40 mt-4">
          <p className="text-[11px] text-muted-foreground">
            Free Postal Entry available. See <Link to="/terms" className="text-primary hover:underline">Terms & Conditions</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

export function BigCountdown({ endsAt }) {
  const { t } = useTranslation();
  const [time, setTime] = useState({ d: 0, h: 0, m: 0, s: 0, done: false });

  useEffect(() => {
    if (!endsAt) return;

    const calculate = () => {
      const diff = Math.max(0, endsAt - Date.now());
      const s = Math.floor(diff / 1000) % 60;
      const m = Math.floor(diff / 60000) % 60;
      const h = Math.floor(diff / 3600000) % 24;
      const d = Math.floor(diff / 86400000);
      return { d, h, m, s, done: diff === 0 };
    };

    setTime(calculate());
    const interval = setInterval(() => setTime(calculate()), 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (!endsAt || time.done) return null;

  const segments = [
    { label: "Days", value: time.d },
    { label: "Hours", value: time.h },
    { label: "Mins", value: time.m },
    { label: "Secs", value: time.s },
  ];

  return (
    <div className="bg-card border border-border/60 rounded-3xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Clock className="w-4 h-4 text-primary" />
        </div>
        <h3 className="font-serif font-bold text-lg text-(--color-foreground)">Draw Countdown</h3>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {segments.map((seg) => (
          <div key={seg.label} className="relative group">
            <div className="bg-white/3 border border-white/10 rounded-2xl p-4 text-center transition-all duration-300 group-hover:border-primary/40 group-hover:bg-primary/5">
              <span className="block text-2xl md:text-3xl font-black text-white tabular-nums tracking-tighter">
                {String(seg.value).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">
                {seg.label}
              </span>
            </div>
            {seg.label !== "Secs" && (
              <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 text-muted-foreground/30 font-black text-xl">:</div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Live Competition Draw Pending</span>
      </div>
    </div>
  );
}




export function StatsGrid({ ticketPrice, maxTickets, sold, priceLabel }) {
  const { t } = useTranslation();
  const stats = [
    { label: t("competitionDetails.stats.ticketPrice"), value: `${ticketPrice || 0} €` },
    { label: t("competitionDetails.stats.maxTickets"), value: (maxTickets || 0).toLocaleString() },
    { label: t("competitionDetails.stats.ticketsSold"), value: (sold || 0).toLocaleString() },
    { label: t("competitionDetails.stats.prizeValue"), value: priceLabel || t("common.loading") },
  ];

  return (
    <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map(({ label, value }) => (
        <div key={label} className="bg-card border border-border/50 rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
          <p className="font-bold text-lg text-primary">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ParticipantCard({ participant }) {
  const { t } = useTranslation();
  const {
    initials,
    name,
    tickets,
    rank,
    borderColor,
    rankColor,
  } = participant;

  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/50 bg-card hover:border-primary/20 hover:bg-card/80 transition-colors">
      <div className={`w-10 h-10 rounded-full border bg-primary/15 ${borderColor} flex items-center justify-center font-bold text-sm shrink-0 text-(--color-foreground)`}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate text-(--color-foreground)">{name}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="flex items-center gap-1 text-[11px] text-primary font-medium">
            <Ticket className="w-3 h-3 shrink-0" aria-hidden="true" />
            {tickets} {t("competitionDetails.ticketCount")}
          </span>
        </div>
      </div>
      <span className={`text-xs font-black shrink-0 ${rankColor}`}>#{rank}</span>
    </div>
  );
}

export function ParticipantsSection({ participants }) {
  const { t } = useTranslation();
  return (
    <section className="mt-14">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-(--color-foreground)">
              {t("competitionDetails.participantsTitle")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg mt-1">
            {t("competitionDetails.participantsSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2">
          <Users className="w-4 h-4 text-primary" aria-hidden="true" />
          <span className="font-bold text-primary tabular-nums">{participants?.length || 0}</span>
          <span className="text-sm text-muted-foreground">{t("competitionDetails.participants")}</span>
        </div>
      </div>

      {(participants?.length || 0) > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {participants.map((p, idx) => (
            <ParticipantCard
              key={idx}
              participant={{
                ...p,
                initials: p.initials || p.name?.split(" ").map((n) => n[0]).join("").toUpperCase() || "??",
                borderColor: p.borderColor || "border-border/50",
                rankColor: p.rankColor || "text-muted-foreground",
                rank: p.rank || (idx + 1),
              }}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-card/50 border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">{t('competitionDetails.noParticipants')}</p>
        </div>
      )}

      <div className="mt-6 flex items-center gap-2.5 bg-muted/20 border border-border/40 rounded-xl p-4">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {t("competitionDetails.transparencyNote")}
        </p>
      </div>
    </section>
  );
}

export function InstagramLiveCard({ url }) {
  const { t } = useTranslation();

  const cardContent = (
    <>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
            <Play className="w-4 h-4 text-primary fill-primary" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white">Watch the draw live</h4>
            <p className="text-xs text-muted-foreground/50">
              {url ? "@NESSWIN · Official Channel" : "@NESSWIN · When countdown ends"}
            </p>
          </div>
        </div>

        {url ? (
          <span className="text-sm font-black text-primary uppercase tracking-widest group-hover:scale-105 transition-transform">
            Join
          </span>
        ) : (
          <span className="text-sm font-black text-primary uppercase tracking-widest opacity-50 cursor-not-allowed">
            Follow
          </span>
        )}
      </div>

      {!url && (
        <div className="mt-4 pt-4 border-t border-white/5">
          <p className="text-[10px] font-medium text-muted-foreground/40 italic">
            Live is yet to be started, come back soon to watch the official draw.
          </p>
        </div>
      )}
    </>
  );

  return (
    <div className="bg-[#121212] border border-white/5 rounded-3xl p-6 shadow-2xl">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-linear-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] flex items-center justify-center shrink-0 shadow-lg shadow-pink-500/20">
          <FaInstagram className="w-9 h-9 text-white" />
        </div>
        <div>
          <h3 className="font-serif font-bold text-xl text-white tracking-tight">Live Draw</h3>
          <p className="text-sm text-muted-foreground/60">Draw streamed live on instagram</p>
        </div>
      </div>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-white/3 border border-white/5 rounded-2xl p-5 group transition-all hover:bg-white/5 cursor-pointer"
        >
          {cardContent}
        </a>
      ) : (
        <div className="bg-white/3 border border-white/5 rounded-2xl p-5 group transition-all hover:bg-white/5">
          {cardContent}
        </div>
      )}
    </div>
  );
}


export function WinnerHallOfFame({ status, winnerName, ticketNumber, comment, rating, date }) {
  const { t } = useTranslation();
  const isCompleted = status === 'completed';

  if (!isCompleted || !comment) return null;

  return (
    <div className="mt-16 relative">
      {/* Decorative background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-primary/5 blur-[120px] rounded-full -z-10" />

      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-black text-primary uppercase tracking-[0.2em]">
            <Quote size={12} />
            {t('competitionDetails.hallOfFame.experienceTitle')}
          </div>
          <h2 className="text-3xl md:text-4xl font-serif font-bold text-white">{t('competitionDetails.hallOfFame.whatWinnerSaid')}</h2>
        </div>

        <div className="relative group">
          <div className="relative bg-[#121212] border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl overflow-hidden transition-all duration-500 hover:border-primary/30">
            <Quote className="absolute top-8 left-8 text-primary/10 w-24 h-24 z-0" />

            <div className="relative z-10 flex flex-col items-center text-center space-y-8">
              <div className="space-y-6 w-full">
                {/* Rating Stars */}
                <div className="flex justify-center gap-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={24}
                      className={i < Math.floor(rating || 5) ? "fill-amber-500 text-amber-500" : "text-white/10"}
                    />
                  ))}
                </div>

                {/* Comment */}
                <p className="text-lg md:text-xl font-medium text-white/90 italic leading-relaxed max-w-2xl mx-auto">
                  "{comment}"
                </p>

                <div className="pt-8 border-t border-white/5 flex flex-col items-center">
                  <p className="font-bold text-white mb-1">{winnerName}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    {t('competitionDetails.hallOfFame.verifiedWinner')} · {date ? new Date(date).toLocaleDateString() : t('competitionDetails.hallOfFame.recent')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
