import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      navbar: {
        competitions: "Competitions",
        howItWorks: "How It Works",
        winners: "Winners",
        signIn: "Sign In",
        languageLabel: "Language"
      },
      common: {
        sold: "sold",
        remaining: "remaining",
        beforeDraw: "before draw",
        participate: "Participate"
      },
      hero: {
        liveBadge: "Live Draws · Certified · Transparent",
        titleTop: "Win the",
        titleBottom: "Extraordinary",
        subtitle: "Luxury cars, watches, dream trips — accessible to everyone. Participate from €2 and try your luck in our certified draws.",
        seeCompetitions: "See Competitions",
        ourWinners: "Our Winners",
        stats: {
          participants: "Participants",
          winners: "Winners",
          prizes: "In Prizes",
          countries: "Countries"
        },
        trustBadges: {
          securePayments: "Secure payments",
          notarizedDraws: "Notarized draws",
          publicResults: "Public results"
        }
      },
      featured: {
        overline: "Current Prizes",
        title: "Ongoing Competitions",
        subtitle: "Exceptional prizes await you. Every ticket is a chance to change your life.",
        seeAll: "See all competitions"
      },
      howItWorks: {
        overline: "Simple and Transparent",
        title: "How It Works",
        subtitle: "In 4 simple steps, you can go from spectator to winner.",
        steps: {
          one: {
            title: "Choose Your Prize",
            desc: "Browse our exclusive selection of exceptional prizes: cars, luxury watches, travel and much more."
          },
          two: {
            title: "Buy Your Tickets",
            desc: "Secure your entries from €2. The more tickets you have, the higher your chances of winning."
          },
          three: {
            title: "Live Draw",
            desc: "Watch the draw in real time, supervised by a notary. Completely transparent and verifiable."
          },
          four: {
            title: "Claim Your Prize",
            desc: "The winner is notified immediately. Delivery guaranteed or personal handover depending on the prize."
          }
        }
      },
      winnersShowcase: {
        overline: "They Won",
        title: "Our Winners",
        subtitle: "Real people, real prizes. Read their testimonials.",
        prizeWon: "Prize Won",
        tickets: "Tickets",
        launchTitle: "1,247 winners since our launch",
        launchText: "Every draw is filmed live and videos are publicly available. Transparency is not optional - it is our commitment."
      },
      trust: {
        overline: "Our Commitment",
        title: "Why Trust Us?",
        subtitle: "NessWin was designed to be the most transparent and reliable platform on the market.",
        items: {
          publicResults: {
            title: "Public Results",
            desc: "All draws are broadcast live. Results are public and verifiable by anyone.",
            badge: "Fully Transparent"
          },
          securePayments: {
            title: "Secure Payments",
            desc: "256-bit SSL encryption. Payments processed by Stripe, PCI DSS Level 1 certified - banking standard.",
            badge: "Stripe Certified"
          },
          support: {
            title: "24/7 Support",
            desc: "Our dedicated team is available 24/7 to answer all your questions.",
            badge: "Response < 2h"
          }
        }
      },
      cta: {
        titleTop: "Ready to Try",
        titleBottom: "Your Luck?",
        subtitle: "Join thousands of participants in our premium competitions. The next winner could be you.",
        signIn: "Sign In",
        nextDraw: "Watch Next Draw",
        legal: "By participating, you accept our terms. Legal competitions, open to adults. Draws supervised by notary."
      },
      footer: {
        description: "The premium prize competition platform. Exceptional prizes, certified draws, total transparency.",
        platform: "Platform",
        company: "Company",
        legal: "Legal",
        links: {
          competitions: "Our Competitions",
          howItWorks: "How It Works",
          winners: "Our Winners",
          liveDraws: "Live Draws",
          press: "Press",
          affiliates: "Affiliates",
          careers: "Careers",
          terms: "Terms and Conditions",
          privacy: "Privacy Policy",
          rules: "Competition Rules",
          freePostalEntry: "Free Postal Entry",
          responsiblePlay: "Responsible Play (18+)",
          contactUs: "Contact Us"
        },
        rights: "© 2026 NessWin. All rights reserved. Competition for 18+ only.",
        systems: "All systems operational"
      },
      competitionsPage: {
        statusFilters: {
          all: "All",
          ongoing: "Ongoing",
          comingSoon: "Coming Soon",
          completed: "Completed"
        },
        categoryFilters: {
          allCategories: "All Categories",
          cars: "Cars",
          watches: "Watches",
          travel: "Travel",
          realEstate: "Real Estate",
          tech: "Tech",
          other: "Other"
        },
        overline: "Catalogue",
        title: "All Competitions",
        subtitle: "Cars, watches, travel, real estate - exceptional prizes within reach of a ticket.",
        noResults: "No competitions match your filters."
      },
      competitionDetails: {
        competitions: "Competitions",
        ongoing: "Ongoing",
        whatsIncluded: "What's included",
        yourPrize: "Your prize",
        perTicket: "/ ticket",
        loginToJoin: "Sign in to participate",
        loginSubtitle: "Create an account for free and try your luck today.",
        signIn: "Sign In",
        drawOn: "Draw on",
        left: "Remaining",
        liveNote: "All draws are filmed live and winners are announced publicly.",
        stats: {
          ticketPrice: "Ticket Price",
          maxTickets: "Max Tickets",
          ticketsSold: "Tickets Sold",
          prizeValue: "Prize Value"
        },
        participantsTitle: "Participants and Transparency",
        participantsSubtitle: "Every ticket purchase is listed here. Full transparency on all participants.",
        participants: "participant(s)",
        ticketCount: "ticket(s)",
        transparencyNote: "This list is updated in real time. Every participant is listed by their public username or real name. Draws are supervised by a certified notary and filmed live."
      },
      winnersPage: {
        hallOfFame: "Hall of Fame",
        title: "Our Winners",
        subtitle: "They participated, they won. Discover the lucky winners of our competitions and their testimonials.",
        ticket: "Ticket"
      }
    }
  },
  fr: {
    translation: {
      navbar: {
        competitions: "Concours",
        howItWorks: "Comment ca marche",
        winners: "Gagnants",
        signIn: "Connexion",
        languageLabel: "Langue"
      },
      common: {
        sold: "vendus",
        remaining: "restants",
        beforeDraw: "avant tirage",
        participate: "Participer"
      },
      hero: {
        liveBadge: "Tirages en direct · Certifies · Transparence",
        titleTop: "Gagnez l'",
        titleBottom: "Extraordinaire",
        subtitle: "Voitures de luxe, montres, voyages de reve - accessibles a tous. Participez des 2 € et tentez votre chance dans nos tirages certifies.",
        seeCompetitions: "Voir les concours",
        ourWinners: "Nos gagnants",
        stats: {
          participants: "Participants",
          winners: "Gagnants",
          prizes: "De lots",
          countries: "Pays"
        },
        trustBadges: {
          securePayments: "Paiements securises",
          notarizedDraws: "Tirages notaries",
          publicResults: "Resultats publics"
        }
      },
      featured: {
        overline: "Lots en cours",
        title: "Concours en cours",
        subtitle: "Des lots exceptionnels vous attendent. Chaque ticket est une chance de changer votre vie.",
        seeAll: "Voir tous les concours"
      },
      howItWorks: {
        overline: "Simple et transparent",
        title: "Comment ca marche",
        subtitle: "En 4 etapes simples, passez de spectateur a gagnant.",
        steps: {
          one: {
            title: "Choisissez votre lot",
            desc: "Parcourez notre selection exclusive de lots exceptionnels : voitures, montres de luxe, voyages et bien plus."
          },
          two: {
            title: "Achetez vos tickets",
            desc: "Obtenez vos participations des 2 €. Plus vous avez de tickets, plus vos chances augmentent."
          },
          three: {
            title: "Tirage en direct",
            desc: "Suivez le tirage en temps reel, supervise par un notaire. Completement transparent et verifiable."
          },
          four: {
            title: "Recuperez votre lot",
            desc: "Le gagnant est notifie immediatement. Livraison garantie ou remise en main propre selon le lot."
          }
        }
      },
      winnersShowcase: {
        overline: "Ils ont gagne",
        title: "Nos gagnants",
        subtitle: "De vraies personnes, de vrais lots. Consultez leurs temoignages.",
        prizeWon: "Lot gagne",
        tickets: "Tickets",
        launchTitle: "1 247 gagnants depuis notre lancement",
        launchText: "Chaque tirage est filme en direct et les videos sont accessibles publiquement. La transparence n'est pas une option, c'est notre engagement."
      },
      trust: {
        overline: "Notre engagement",
        title: "Pourquoi nous faire confiance ?",
        subtitle: "NessWin a ete concu pour etre la plateforme la plus transparente et fiable du marche.",
        items: {
          publicResults: {
            title: "Resultats publics",
            desc: "Tous les tirages sont diffuses en direct. Les resultats sont publics et verifiables par tous.",
            badge: "Transparence totale"
          },
          securePayments: {
            title: "Paiements securises",
            desc: "Chiffrement SSL 256 bits. Paiements traites par Stripe, certifie PCI DSS niveau 1.",
            badge: "Certifie Stripe"
          },
          support: {
            title: "Support 24/7",
            desc: "Notre equipe dediee est disponible 24/7 pour repondre a toutes vos questions.",
            badge: "Reponse < 2h"
          }
        }
      },
      cta: {
        titleTop: "Pret a tenter",
        titleBottom: "votre chance ?",
        subtitle: "Rejoignez des milliers de participants dans nos concours premium. Le prochain gagnant, c'est peut-etre vous.",
        signIn: "Connexion",
        nextDraw: "Voir le prochain tirage",
        legal: "En participant, vous acceptez nos conditions. Concours legaux reserves aux adultes. Tirages supervises par notaire."
      },
      footer: {
        description: "La plateforme premium de concours a lots. Lots exceptionnels, tirages certifies, transparence totale.",
        platform: "Plateforme",
        company: "Entreprise",
        legal: "Legal",
        links: {
          competitions: "Nos concours",
          howItWorks: "Comment ca marche",
          winners: "Nos gagnants",
          liveDraws: "Tirages en direct",
          press: "Presse",
          affiliates: "Affiliation",
          careers: "Carrieres",
          terms: "Conditions generales",
          privacy: "Politique de confidentialite",
          rules: "Regles du concours",
          freePostalEntry: "Participation postale gratuite",
          responsiblePlay: "Jeu responsable (18+)",
          contactUs: "Nous contacter"
        },
        rights: "© 2026 NessWin. Tous droits reserves. Concours reserves aux 18+.",
        systems: "Tous les systemes operationnels"
      },
      competitionsPage: {
        statusFilters: {
          all: "Tous",
          ongoing: "En cours",
          comingSoon: "Bientot",
          completed: "Termines"
        },
        categoryFilters: {
          allCategories: "Toutes categories",
          cars: "Voitures",
          watches: "Montres",
          travel: "Voyage",
          realEstate: "Immobilier",
          tech: "Tech",
          other: "Autre"
        },
        overline: "Catalogue",
        title: "Tous les concours",
        subtitle: "Voitures, montres, voyages, immobilier - des lots exceptionnels accessibles avec un ticket.",
        noResults: "Aucun concours ne correspond a vos filtres."
      },
      competitionDetails: {
        competitions: "Concours",
        ongoing: "En cours",
        whatsIncluded: "Ce qui est inclus",
        yourPrize: "Votre lot",
        perTicket: "/ ticket",
        loginToJoin: "Connectez-vous pour participer",
        loginSubtitle: "Creez un compte gratuitement et tentez votre chance des aujourd'hui.",
        signIn: "Connexion",
        drawOn: "Tirage le",
        left: "Restants",
        liveNote: "Tous les tirages sont filmes en direct et les gagnants annonces publiquement.",
        stats: {
          ticketPrice: "Prix du ticket",
          maxTickets: "Tickets max",
          ticketsSold: "Tickets vendus",
          prizeValue: "Valeur du lot"
        },
        participantsTitle: "Participants et transparence",
        participantsSubtitle: "Chaque achat de ticket est liste ici. Transparence totale sur tous les participants.",
        participants: "participant(s)",
        ticketCount: "ticket(s)",
        transparencyNote: "Cette liste est mise a jour en temps reel. Chaque participant est affiche avec son nom public ou reel. Les tirages sont supervises par un notaire certifie et filmes en direct."
      },
      winnersPage: {
        hallOfFame: "Hall of Fame",
        title: "Nos gagnants",
        subtitle: "Ils ont participe, ils ont gagne. Decouvrez les heureux gagnants de nos concours et leurs temoignages.",
        ticket: "Ticket"
      }
    }
  }
};

const savedLanguage = window.localStorage.getItem("lang") || "en";

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
