import { useState, useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CircleCheck,
  Lock,
  LogIn,
  Video,
  Users,
  ShieldCheck,
  Ticket,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../context/AuthContext";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../../utils/firebase";
import Modal from "../../../components/ui/Modal";



// ─── Sub-components ───────────────────────────────────────────────────────────

function Breadcrumb({ title }) {
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
      <span className="text-(--color-foreground) truncate max-w-50">
        {title}
      </span>
    </nav>
  );
}

function ImageGallery({ images, title, status }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative aspect-4/3 rounded-2xl overflow-hidden">
        <img
          src={images[active]}
          alt={title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/30 to-transparent" />
        <span className={`absolute top-4 left-4 inline-flex items-center justify-center rounded-md border border-transparent px-2 py-0.5 text-xs font-medium tracking-wider uppercase ${
          status === 'end' 
            ? 'bg-red-500 text-white' 
            : 'bg-primary text-(--color-primary-foreground)'
        }`}>
          {status === 'end' ? 'Closed' : t("competitionDetails.ongoing")}
        </span>
      </div>

      {/* Thumbnails */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {images.map((src, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
              active === i
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

function WhatsIncluded({ items }) {
  const { t } = useTranslation();
  return (
    <div className="bg-card border border-border/60 rounded-2xl p-5">
      <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
        {t("competitionDetails.whatsIncluded")}
      </h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm">
            <CircleCheck
              className="w-4 h-4 text-primary shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <span className="text-(--color-foreground)">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TicketPurchaseCard({ competition }) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const {
    title,
    images,
    ticketPrice,
    drawDate,
    drawTime,
    sold,
    total,
  } = competition;

  const remaining = total - sold;
  const progress = Math.min(100, Math.round((sold / total) * 100));

  return (
    <div className="rounded-3xl border border-border/60 bg-card overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.10)]">
      {/* Card header image */}
      <div className="relative h-36 overflow-hidden">
        <img
          src={images[0]}
          alt={title}
          className="w-full h-full object-cover"
        />
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

      {/* Card body */}
      <div className="p-6 space-y-5">
        {!currentUser ? (
          <>
            {/* Sign in prompt */}
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

            {/* Sign in button */}
            <Link 
              to="/signin"
              className="inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-medium h-9 px-4 bg-primary text-(--color-primary-foreground) hover:opacity-90 transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              {t("competitionDetails.signIn")}
            </Link>
          </>
        ) : (
          <div className="text-center py-2">
            {competition.status === 'cancelled' && (
              <div className="mb-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-semibold">
                This competition has been cancelled.
              </div>
            )}
            {competition.status === 'paused' && (
              <div className="mb-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm font-semibold">
                For now its paused check back soon.
              </div>
            )}
            {competition.status === 'end' && (
              <div className="mb-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-semibold">
                This competition has ended.
              </div>
            )}
            <button 
              onClick={competition.onParticipate}
              disabled={competition.status === 'cancelled' || competition.status === 'paused' || competition.status === 'end'}
              className="inline-flex items-center justify-center gap-2 w-full rounded-md text-sm font-semibold h-10 px-4 bg-primary text-(--color-primary-foreground) hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <Ticket className="w-4 h-4" aria-hidden="true" />
              {t("common.participate")}
            </button>
          </div>
        )}

        {/* Draw info grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/30 border border-border/40 rounded-2xl p-3.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("competitionDetails.drawOn")}
            </p>
            <p className="text-xs font-semibold leading-tight capitalize text-(--color-foreground)">
              {drawDate}
            </p>
            <p className="text-xs text-primary font-bold mt-0.5">
              {drawTime}
            </p>
          </div>
          <div className="bg-muted/30 border border-border/40 rounded-2xl p-3.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {t("competitionDetails.left")}
            </p>
            <p className="font-bold text-primary text-base">
              {remaining.toLocaleString()}
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="relative w-full h-2.5 rounded-full bg-white/5 border border-white/5 overflow-hidden mt-2"
            >
              <div
                className="absolute left-0 top-0 h-full bg-linear-to-r from-primary via-primary to-primary/80 rounded-full transition-all duration-700 ease-out"
                style={{ 
                  width: `${progress}%`,
                  boxShadow: progress > 0 ? '0 0 15px oklch(0.78 0.14 78 / 0.5)' : 'none'
                }}
              />
            </div>
          </div>
        </div>

        {/* Live draw note */}
        <div className="flex items-start gap-2 bg-muted/20 rounded-xl p-3">
          <Video
            className="w-4 h-4 text-primary shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t("competitionDetails.liveNote")}
          </p>
        </div>

        {/* Free Postal Entry note */}
        <div className="text-center pt-1 border-t border-border/40 mt-4">
          <p className="text-[11px] text-muted-foreground">
            Free Postal Entry available. See <Link to="/terms" className="text-primary hover:underline">Terms & Conditions</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatsGrid({ ticketPrice, maxTickets, sold, priceLabel }) {
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
        <div
          key={label}
          className="bg-card border border-border/50 rounded-xl p-4 text-center"
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            {label}
          </p>
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
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-full border bg-primary/15 ${borderColor} flex items-center justify-center font-bold text-sm shrink-0 text-(--color-foreground)`}
      >
        {initials}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate text-(--color-foreground)">
          {name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="flex items-center gap-1 text-[11px] text-primary font-medium">
            <Ticket className="w-3 h-3 shrink-0" aria-hidden="true" />
            {tickets} {t("competitionDetails.ticketCount")}
          </span>
        </div>
      </div>
      {/* Rank */}
      <span className={`text-xs font-black shrink-0 ${rankColor}`}>
        #{rank}
      </span>
    </div>
  );
}

function ParticipantsSection({ participants }) {
  const { t } = useTranslation();
  return (
    <section className="mt-14">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center">
              <ShieldCheck
                className="w-4 h-4 text-primary"
                aria-hidden="true"
              />
            </div>
            <h2 className="font-serif text-2xl font-bold text-(--color-foreground)">
              {t("competitionDetails.participantsTitle")}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-lg mt-1">
            {t("competitionDetails.participantsSubtitle")}
          </p>
        </div>
        {/* Count badge */}
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2">
          <Users
            className="w-4 h-4 text-primary"
            aria-hidden="true"
          />
          <span className="font-bold text-primary tabular-nums">
            {participants.length}
          </span>
          <span className="text-sm text-muted-foreground">
            {t("competitionDetails.participants")}
          </span>
        </div>
      </div>

      {/* Participant grid */}
      {participants.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {participants.map((p, idx) => (
            <ParticipantCard key={idx} participant={{
              ...p,
              initials: p.initials || p.name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??',
              borderColor: p.borderColor || 'border-border/50',
              rankColor: p.rankColor || 'text-muted-foreground',
              rank: p.rank || (idx + 1)
            }} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-card/50 border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">no one participated till now</p>
        </div>
      )}

      {/* Transparency note */}
      <div className="mt-6 flex items-center gap-2.5 bg-muted/20 border border-border/40 rounded-xl p-4">
        <ShieldCheck
          className="w-4 h-4 text-primary shrink-0"
          aria-hidden="true"
        />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {t("competitionDetails.transparencyNote")}
        </p>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompetitionDetails() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState({}); // { questionId: optionIndex }
  
  // Real-time status update for expired competitions
  useEffect(() => {
    if (!c || !c.endsAt || c.status === 'end') return;
    
    const interval = setInterval(() => {
      if (Date.now() >= c.endsAt) {
        setC(prev => ({ ...prev, status: 'end' }));
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [c?.endsAt, c?.status]);

  useEffect(() => {
    const fetchCompetition = async () => {
      try {
        const compDoc = await getDoc(doc(db, 'competition', id));
        if (compDoc.exists()) {
          const data = compDoc.data();
          const drawDateObj = data.draw_date ? data.draw_date.toDate() : null;
          
          const participantRefs = data.participants || [];
          const resolvedParticipants = await Promise.all(
            participantRefs.slice(0, 15).map(async (ref) => {
              try {
                const userRef = typeof ref === 'string' ? doc(db, ref) : ref;
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                  const userData = userSnap.data();
                  return {
                    name: userData.display_name || userData.name || 'Anonymous User',
                    tickets: 1, 
                  };
                }
              } catch (e) {
                console.error("Error fetching participant user data:", e);
              }
              return null;
            })
          );

          setC({
            id: compDoc.id,
            image: data.image?.[0] || 'https://images.unsplash.com/photo-1553985214-1c3f33cf3ecb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080',
            images: data.image && data.image.length > 0 ? data.image : ['https://images.unsplash.com/photo-1553985214-1c3f33cf3ecb?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=1080'],
            badgeType: data.is_featured ? 'hot' : 'new',
            badgeLabel: data.status === 'active' ? 'Active' : data.status,
            ticketPrice: data.ticket_price || 0,
            ticketPriceLabel: `${data.ticket_price || 0}€/ticket`,
            category: data.category || 'Other',
            title: data.title || 'Untitled',
            subTitle: data.sub_title || '',
            priceLabel: `${data.prize_value?.toLocaleString() || 0} €`,
            sold: Number(data.sold_tickets || 0),
            total: Number(data.total_tickets || 1000),
            endsAt: data.countdown_end ? data.countdown_end.toMillis() : null,
            drawDate: drawDateObj ? drawDateObj.toLocaleDateString() : '',
            drawTime: drawDateObj ? drawDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
            description: data.description || '',
            included: data.included_things || [],
            status: (data.countdown_end && data.countdown_end.toMillis() < Date.now()) ? 'end' : data.status,
            docRef: compDoc.ref,
            participants: resolvedParticipants.filter(p => p !== null)
          });
        }
      } catch (err) {
        console.error("Error fetching competition details:", err);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchCompetition();
  }, [id]);

  const handleParticipateClick = async () => {
    setIsModalOpen(true);
    setCurrentQuestionIndex(0);
    if (questions.length === 0) {
      setLoadingQuestions(true);
      try {
        const qQuery = query(collection(db, 'questions'), where('competition_id', '==', c.docRef));
        const qSnapshot = await getDocs(qQuery);
        const qList = qSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setQuestions(qList);
      } catch (err) {
        console.error("Error fetching questions:", err);
      } finally {
        setLoadingQuestions(false);
      }
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-primary">Loading...</div>;
  }

  if (!c) {
    return <Navigate to="/competitions-component" replace />;
  }

  return (
    <div className="min-h-screen bg-(--color-background)">
      <div className="pt-16 lg:pt-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <Breadcrumb title={c.title} />

          {/* ── Two-column layout ── */}
          <div className="grid lg:grid-cols-2 gap-10 xl:gap-16">

            {/* LEFT — Gallery + included */}
            <div className="space-y-4">
              <ImageGallery images={c.images} title={c.title} status={c.status} />
              <WhatsIncluded items={c.included} />
            </div>

            {/* RIGHT — Info + purchase card */}
            <div className="flex flex-col gap-6">
              {/* Title block */}
              <div>
                <p className="text-xs font-bold text-primary tracking-[0.2em] uppercase mb-2">
                  {c.category}
                </p>
                <h1 className="font-serif text-4xl font-bold leading-tight text-(--color-foreground)">
                  {c.title}
                </h1>
                {c.subTitle && (
                  <p className="text-lg text-muted-foreground mt-1">
                    {c.subTitle}
                  </p>
                )}
                <p className="text-3xl font-bold text-primary mt-2">
                  {c.priceLabel}
                </p>
              </div>

              {/* Description */}
              <p className="text-muted-foreground leading-relaxed">
                {c.description}
              </p>

              {/* Divider */}
              <hr className="border-0 h-px bg-border" />

              {/* Ticket purchase card */}
              <TicketPurchaseCard competition={{ ...c, onParticipate: handleParticipateClick }} />
            </div>
          </div>

          {/* ── Stats row ── */}
          <StatsGrid
            ticketPrice={c.ticketPrice}
            maxTickets={c.total}
            sold={c.sold}
            priceLabel={c.priceLabel}
          />

          {/* ── Participants ── */}
          <ParticipantsSection participants={c.participants} />

          {/* Bottom spacing */}
          <div className="pb-20" />
        </div>
      </div>

      {/* Participate Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={t("common.participate")}
        description="Verify your skill to enter the draw."
      >
        <div className="max-w-md mx-auto w-full">
          {loadingQuestions ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground font-medium animate-pulse">
                Fetching skill questions...
              </p>
            </div>
          ) : questions.length > 0 ? (
            <div className="space-y-6">
              {/* Question Header & Progress */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </span>
                </div>
                <div className="flex gap-1.5 items-center">
                  {questions.map((_, idx) => (
                    <div 
                      key={idx} 
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx === currentQuestionIndex ? 'w-8 bg-primary' : 'w-3 bg-white/10'
                      }`} 
                    />
                  ))}
                </div>
              </div>

              {/* Main Question Card */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-linear-to-r from-primary/20 to-primary/5 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500" />
                <div className="relative bg-[#0A0A0A] border border-white/10 rounded-2xl overflow-hidden">
                  {questions[currentQuestionIndex]?.images?.[0] && (
                    <div className="relative h-48 sm:h-56">
                      <img 
                        src={questions[currentQuestionIndex].images[0]} 
                        alt="Reference" 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-[#0A0A0A] via-transparent to-transparent" />
                    </div>
                  )}
                  
                  <div className="p-5 sm:p-6 space-y-5">
                    <h4 className="text-lg sm:text-xl font-serif font-bold text-white leading-tight">
                      {questions[currentQuestionIndex]?.question}
                    </h4>
                    
                    <div className="grid gap-3">
                      {questions[currentQuestionIndex]?.option?.map((opt, idx) => {
                        const isSelected = selectedOptions[questions[currentQuestionIndex].id] === idx;
                        return (
                          <button 
                            key={idx}
                            onClick={() => setSelectedOptions(prev => ({ ...prev, [questions[currentQuestionIndex].id]: idx }))}
                            className={`group/opt relative w-full text-left px-5 py-4 rounded-xl border transition-all duration-300 cursor-pointer ${
                              isSelected 
                                ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(var(--primary-rgb),0.1)]' 
                                : 'bg-white/[0.03] border-white/5 hover:border-white/20 hover:bg-white/[0.05]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className={`text-sm font-medium transition-colors ${
                                isSelected ? 'text-primary' : 'text-gray-300 group-hover/opt:text-white'
                              }`}>
                                {opt.option}
                              </span>
                              <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                isSelected ? 'bg-primary border-primary' : 'border-white/20 group-hover/opt:border-white/40'
                              }`}>
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

              {/* Navigation Controls */}
              <div className="flex items-center gap-3 pt-2">
                {currentQuestionIndex > 0 ? (
                  <button
                    onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                    className="flex-1 px-6 py-3.5 rounded-xl border border-white/10 text-sm font-bold text-white hover:bg-white/5 transition-all active:scale-95 cursor-pointer"
                  >
                    Back
                  </button>
                ) : (
                   <button
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3.5 rounded-xl border border-white/10 text-sm font-bold text-gray-400 hover:bg-white/5 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                
                {currentQuestionIndex === questions.length - 1 ? (
                  <button
                    onClick={() => {
                      const allAnswered = questions.every(q => selectedOptions[q.id] !== undefined);
                      if (allAnswered) {
                        console.log("Proceeding with answers:", selectedOptions);
                        // Implement checkout/entry logic here
                        setIsModalOpen(false);
                      } else {
                        // Toast or alert to answer all questions
                      }
                    }}
                    className="flex-[1.5] px-6 py-3.5 rounded-xl bg-primary text-black text-sm font-black shadow-[0_8px_20px_-4px_rgba(var(--primary-rgb),0.3)] hover:opacity-90 transition-all active:scale-95 cursor-pointer"
                  >
                    Finish & Enter
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                    disabled={selectedOptions[questions[currentQuestionIndex].id] === undefined}
                    className="flex-[1.5] px-6 py-3.5 rounded-xl bg-primary text-black text-sm font-black shadow-[0_8px_20px_-4px_rgba(var(--primary-rgb),0.3)] hover:opacity-90 disabled:opacity-50 disabled:grayscale transition-all active:scale-95 cursor-pointer"
                  >
                    Next Question
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-dashed border-white/10 flex items-center justify-center mx-auto">
                <Ticket className="w-8 h-8 text-gray-600" />
              </div>
              <div className="space-y-1">
                <p className="text-white font-bold">No Questions Needed</p>
                <p className="text-xs text-muted-foreground">You can proceed directly to participation.</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="mt-4 px-8 py-3 rounded-xl bg-primary text-black text-sm font-bold hover:opacity-90 transition-all cursor-pointer"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
