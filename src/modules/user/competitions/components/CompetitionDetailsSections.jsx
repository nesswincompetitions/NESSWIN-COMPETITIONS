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
  Loader2,
  Gift,
  Tag,
  Play,
} from "lucide-react";
import { FaInstagram } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/state/AuthContext';

export function Breadcrumb({ title }) {
  const { t } = useTranslation();
  return (
    <nav
      className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
      aria-label="Breadcrumb"
    >
      <Link
        to="/competitions"
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
  const isClosed = status === "active" && endsAt && endsAt < Date.now();
  const isEnded = status === "end";

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
          {isEnded ? t("common.ended") : isClosed ? t("common.closed") : t("competitionDetails.ongoing")}
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

export function PrizeVideo({ url }) {
  if (!url) return null;

  const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");
  const isVimeo = url.includes("vimeo.com");

  let embedUrl = url;
  if (isYoutube) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      embedUrl = `https://www.youtube.com/embed/${match[2]}`;
    }
  } else if (isVimeo) {
    const vimeoId = url.split("/").pop();
    embedUrl = `https://player.vimeo.com/video/${vimeoId}`;
  }

  return (
    <div className="space-y-4 mt-8">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
          <Video className="w-4 h-4 text-primary" />
        </div>
        <h3 className="font-serif font-bold text-xl text-(--color-foreground)">Watch Prize Video</h3>
      </div>
      <div className="relative aspect-video rounded-3xl overflow-hidden border border-border/40 bg-card shadow-2xl group">
        {isYoutube || isVimeo ? (
          <iframe
            src={embedUrl}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="Prize Video"
          />
        ) : (
          <video src={url} controls className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-3xl" />
      </div>
    </div>
  );
}

export function TicketPurchaseCard({ competition, skillPassed, ticketQuantity, setTicketQuantity, pendingReferralCount, freeTicketsQuantity, setFreeTicketsQuantity, onBuyTickets, isProcessing, orderResult, onBuyMore, checkoutError, userHasTickets, userTickets, onViewAllTickets }) {
  const { t } = useTranslation();
  const { currentUser, userData } = useAuth();
  const {
    sold,
    total,
    status,
    endsAt,
    title,
    images,
    ticketPrice,
  } = competition;

  const isClosed = status === "active" && endsAt && endsAt < Date.now();
  const isEnded = status === "end";
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
        ) : (currentUser && userData && !userData.is_verified) ? (
          <div className="text-center space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(245,158,11,0.2)]">
              <AlertTriangle className="w-5 h-5 text-amber-500" aria-hidden="true" />
            </div>
            <h3 className="font-serif font-bold text-lg text-(--color-foreground)">
              Verification Required
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Please complete your account setup and phone verification to participate.
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
        ) : (skillPassed && !isClosed && !isEnded) ? (
          <div className="space-y-6">
            {userTickets.length > 0 && (
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
                    <div 
                      key={tk.id}
                      className="h-10 rounded-lg bg-white/[0.03] border border-white/5 flex items-center justify-center"
                    >
                      <span className="text-[10px] font-mono font-bold text-muted-foreground">
                        {tk.ticket_sequence}
                      </span>
                    </div>
                  ))}
                  {userTickets.length > 4 && (
                    <button 
                      onClick={onViewAllTickets}
                      className="h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-all"
                    >
                      <span className="text-[10px] font-bold text-primary">+{userTickets.length - 4} more</span>
                    </button>
                  )}
                </div>
                <div className="h-px bg-border/40 my-2" />
              </div>
            )}

            <div className="bg-[#0A1A14] border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Gift className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-[11px] font-bold text-emerald-400 leading-tight">
                {t("competitionDetails.buy10Get1Free")}
              </p>
            </div>
            {pendingReferralCount > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Ticket className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {t("competitionDetails.freeTickets")} user's referral
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: pendingReferralCount }, (_, i) => i + 1).map((num) => (
                    <button
                      key={num}
                      onClick={() => setFreeTicketsQuantity(freeTicketsQuantity === num ? 0 : num)}
                      className={`w-10 h-12 rounded-xl border font-bold text-sm transition-all duration-300 cursor-pointer ${
                        freeTicketsQuantity === num
                          ? "bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]"
                          : "bg-white/[0.03] border-white/5 text-muted-foreground hover:border-white/20 hover:text-white"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Ticket className="w-3.5 h-3.5 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest">{t("competitionDetails.individualTickets")}</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    key={num}
                    onClick={() => setTicketQuantity(num)}
                    className={`h-12 rounded-xl border font-bold text-sm transition-all duration-300 cursor-pointer ${ticketQuantity === num
                      ? "bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]"
                      : "bg-white/[0.03] border-white/5 text-muted-foreground hover:border-white/20 hover:text-white"
                      }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-border/40" />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t("competitionDetails.advantageousPacks")}</span>
                <div className="h-px flex-1 bg-border/40" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: "prestige", name: "Pack Prestige", tickets: 15, discount: 10, popular: false },
                  { id: "elite", name: "Pack Elite", tickets: 20, discount: 15, popular: false },
                  { id: "gold", name: "Pack Gold", tickets: 25, discount: 20, popular: true },
                  { id: "diamond", name: "Pack Diamond", tickets: 50, discount: 25, popular: false },
                ].map((pack) => {
                  const isSelected = ticketQuantity === pack.tickets;
                  return (
                    <button
                      key={pack.id}
                      onClick={() => setTicketQuantity(pack.tickets)}
                      className={`relative p-5 rounded-2xl border text-left transition-all duration-500 cursor-pointer group ${isSelected
                        ? "bg-primary/5 border-primary shadow-[0_0_30px_rgba(var(--primary-rgb),0.15)]"
                        : "bg-white/[0.02] border-white/5 hover:border-white/20"
                        }`}
                    >
                      {pack.popular && (
                        <div className="absolute -top-px -right-px px-3 py-1 bg-primary rounded-bl-xl rounded-tr-2xl">
                          <span className="text-[8px] font-black text-black uppercase tracking-tighter">{t("common.popular")}</span>
                        </div>
                      )}
                      <div className="space-y-1">
                        <span className={`inline-block px-2 py-0.5 rounded-lg text-[9px] font-bold border transition-colors ${isSelected ? "bg-primary/20 border-primary/40 text-primary" : "bg-white/5 border-white/10 text-muted-foreground"
                          }`}>
                          -{pack.discount}%
                        </span>
                        <p className="text-sm font-bold text-white pt-1">{pack.name}</p>
                        <p className="text-xs text-muted-foreground">{pack.tickets} {t("common.tickets")}</p>
                        <p className="text-lg font-black text-primary pt-1">
                          {(pack.tickets * ticketPrice * (1 - pack.discount / 100)).toFixed(0)} €
                        </p>
                      </div>
                      {isSelected && (
                        <div className="absolute inset-0 rounded-2xl border-2 border-primary/50 animate-pulse-slow pointer-events-none" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    {t("common.subtotal")} · {ticketQuantity + freeTicketsQuantity + Math.floor(ticketQuantity / 10)} {t("common.tickets")}
                  </span>
                  <span className="font-bold text-white">{(ticketQuantity * ticketPrice).toFixed(2)} €</span>
                </div>
                {(() => {
                  const packs = [
                    { tickets: 15, discount: 10 },
                    { tickets: 20, discount: 15 },
                    { tickets: 25, discount: 20 },
                    { tickets: 50, discount: 25 },
                  ];
                  const activePack = packs.find((p) => p.tickets === ticketQuantity);
                  if (activePack) {
                    const discountAmt = (ticketQuantity * ticketPrice * activePack.discount) / 100;
                    return (
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <Tag className="w-3.5 h-3.5" />
                          <span className="font-bold">{t("common.discount")} {activePack.discount}%</span>
                        </div>
                        <span className="font-bold text-emerald-400">-{discountAmt.toFixed(2)} €</span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {(() => {
                  const bonus = Math.floor(ticketQuantity / 10);
                  if (bonus > 0) {
                    return (
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <Gift className="w-3.5 h-3.5" />
                          <span className="font-bold">{t("competitionDetails.bonusTickets")}</span>
                        </div>
                        <span className="font-bold text-emerald-400">+{bonus} {t("common.free")} 🎁</span>
                      </div>
                    );
                  }
                  return null;
                })()}
                {freeTicketsQuantity > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <Gift className="w-3.5 h-3.5" />
                      <span className="font-bold">Referral Tickets</span>
                    </div>
                    <span className="font-bold text-emerald-400">+{freeTicketsQuantity} {t("common.free")} 🎫</span>
                  </div>
                )}
              </div>
              <div className="h-px bg-white/5" />
              <div className="flex justify-between items-center pt-1">
                <span className="text-base font-black text-white uppercase tracking-wider">{t("common.total")}</span>
                <span className="text-2xl font-black text-primary">
                  {(() => {
                    const packs = [
                      { tickets: 15, discount: 10 },
                      { tickets: 20, discount: 15 },
                      { tickets: 25, discount: 20 },
                      { tickets: 50, discount: 25 },
                    ];
                    const activePack = packs.find((p) => p.tickets === ticketQuantity);
                    const subtotal = ticketQuantity * ticketPrice;
                    const discount = activePack ? (subtotal * activePack.discount / 100) : 0;
                    return (subtotal - discount).toFixed(2);
                  })()} €
                </span>
              </div>
            </div>
            {checkoutError && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {checkoutError}
              </div>
            )}
            <button
              onClick={onBuyTickets}
              disabled={isProcessing}
              className="group/btn relative w-full h-16 rounded-2xl bg-primary overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
            >
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
              <div className="relative flex items-center justify-center gap-3">
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin text-black" />
                ) : (
                  <ShoppingCart className="w-5 h-5 text-black" />
                )}
                <span className="text-base font-black text-black uppercase tracking-widest">
                  {isProcessing ? t("common.processing") : t("competitionDetails.proceedToPayment")}
                </span>
              </div>
            </button>
          </div>
        ) : (
          <div className="text-center py-2">
            {/* Status banners */}
            {competition.status === 'ready_to_draw' && (
              <div className="mb-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm font-semibold">
                {t("common.competitionClosed")}
              </div>
            )}
            {competition.status === 'sold_out' && (
              <div className="mb-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-semibold">
                All tickets have been sold out.
              </div>
            )}
            {isEnded && (
              <div className="mb-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-semibold">
                This competition has ended.
              </div>
            )}

            {/* Smart Participate Button */}
            {(() => {
              const isReadyToDraw = competition.status === 'ready_to_draw';
              const isSoldOut    = competition.status === 'sold_out';
              const isDisabled   = competition.status !== 'active' || isClosed || isEnded || competition.gateStatus === 'loading';

              let icon, label;
              if (competition.gateStatus === 'loading') {
                icon  = <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />;
                label = 'Checking eligibility...';
              } else if (isReadyToDraw || isClosed) {
                icon  = <Clock className="w-4 h-4" aria-hidden="true" />;
                label = t('common.drawPending');
              } else if (isSoldOut) {
                icon  = <Ticket className="w-4 h-4" aria-hidden="true" />;
                label = t('common.soldOut');
              } else if (isEnded) {
                icon  = <Sparkles className="w-4 h-4" aria-hidden="true" />;
                label = t('common.ended');
              } else if (userHasTickets) {
                icon  = <ShoppingCart className="w-4 h-4" aria-hidden="true" />;
                label = t('common.buyMoreTickets');
              } else {
                icon  = <Ticket className="w-4 h-4" aria-hidden="true" />;
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
              <span>{t("competitionDetails.left")}</span>
            </div>
            <div className="text-white">
              <span className="text-primary">{remaining.toLocaleString()}</span>
              <span className="text-muted-foreground opacity-50"> / {total.toLocaleString()}</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/5 border border-white/5 overflow-hidden p-[1px]">
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
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-center transition-all duration-300 group-hover:border-primary/40 group-hover:bg-primary/5">
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
    { label: t("competitionDetails.stats.ticketPrice"), value: `${ticketPrice} €` },
    { label: t("competitionDetails.stats.maxTickets"), value: maxTickets.toLocaleString() },
    { label: t("competitionDetails.stats.ticketsSold"), value: sold.toLocaleString() },
    { label: t("competitionDetails.stats.prizeValue"), value: priceLabel },
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
          <span className="font-bold text-primary tabular-nums">{participants.length}</span>
          <span className="text-sm text-muted-foreground">{t("competitionDetails.participants")}</span>
        </div>
      </div>

      {participants.length > 0 ? (
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
          <p className="text-muted-foreground">no one participated till now</p>
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

      <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 group transition-all hover:bg-white/[0.05]">
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
            <a 
              href={url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm font-black text-primary uppercase tracking-widest hover:scale-105 transition-transform cursor-pointer"
            >
              Join
            </a>
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
      </div>
    </div>
  );
}

