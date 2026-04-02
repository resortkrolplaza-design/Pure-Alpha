// =============================================================================
// Loyal App -- i18n (PL + EN)
// All 85+ keys from loyal-i18n.ts portal + mobile-specific keys
// =============================================================================

export type Lang = "pl" | "en";

const pl: Record<string, string> = {
  // -- Shell / tabs -----------------------------------------------------------
  "tab.stay": "M\u00f3j Pobyt",
  "tab.loyalty": "Punkty",
  "tab.rewards": "Nagrody",
  "tab.hotel": "Hotel",
  "tab.messages": "Wiadomo\u015bci",

  // -- Shell / misc -----------------------------------------------------------
  "shell.sessionExpired": "Sesja wygas\u0142a",
  "shell.sessionExpiredDesc": "Od\u015bwie\u017c stron\u0119, aby kontynuowa\u0107.",
  "shell.refresh": "Od\u015bwie\u017c",
  "shell.createAccount": "Utw\u00f3rz konto, aby zarz\u0105dza\u0107 punktami ze wszystkich hoteli.",
  "shell.register": "Zarejestruj si\u0119",
  "shell.closeBanner": "Zamknij baner",
  "shell.navLabel": "Nawigacja portalu",

  // -- StayTab ----------------------------------------------------------------
  "stay.greetMorning": "Dzie\u0144 dobry",
  "stay.greetAfternoon": "Witaj",
  "stay.greetEvening": "Dobry wiecz\u00f3r",
  "stay.guest": "Go\u015b\u0107",
  "stay.highestTier": "Najwy\u017cszy poziom",
  "stay.stays": "Pobyty",
  "stay.earned": "Zdobyte",
  "stay.multiplier": "Mno\u017cnik",
  "stay.hotelServices": "Us\u0142ugi hotelu",
  "stay.currency": "z\u0142",
  "stay.contactHotel": "Kontakt z hotelem",
  "stay.memberSince": "Cz\u0142onek od",
  "stay.yourBenefits": "Twoje korzy\u015bci",

  // -- LoyaltyTab / sources ---------------------------------------------------
  "source.BOOKING": "Rezerwacja",
  "source.CHECKIN": "Zameldowanie",
  "source.CHECKOUT": "Wymeldowanie",
  "source.WIFI_LOGIN": "Logowanie WiFi",
  "source.REFERRAL": "Polecenie",
  "source.REVIEW": "Opinia",
  "source.MANUAL": "Przyznane przez hotel",
  "source.PROMOTION": "Promocja",
  "source.BIRTHDAY": "Urodziny",
  "source.SPEND": "Wydatki w hotelu",
  "source.eco_housekeeping": "Rezygnacja ze sprz\u0105tania",
  "source.eco_receipt": "Rachunek elektroniczny",
  "source.eco_bottle": "W\u0142asna butelka / kubek",
  "source.SIGNUP": "Rejestracja",
  "source.SYSTEM": "System",

  // -- LoyaltyTab / sections --------------------------------------------------
  "loyalty.loadError": "Nie uda\u0142o si\u0119 za\u0142adowa\u0107 historii.",
  "loyalty.multiplierLabel": "Mno\u017cnik:",
  "loyalty.discountLabel": "Zni\u017cka:",
  "loyalty.summary": "Podsumowanie",
  "loyalty.available": "Dost\u0119pne",
  "loyalty.lifetime": "\u0141\u0105cznie",
  "loyalty.pending": "Oczekuj\u0105ce",
  "loyalty.history": "Historia",
  "loyalty.noHistory": "Brak historii transakcji",
  "loyalty.loadMore": "Poka\u017c wi\u0119cej",
  "loyalty.loadingMore": "\u0141adowanie...",
  "loyalty.allTiers": "Poziomy programu",
  "loyalty.currentTier": "(aktualny)",
  "loyalty.from": "od",
  "loyalty.multiplier": "mno\u017cnik",
  "loyalty.howToEarn": "Jak zdobywa\u0107",
  "loyalty.firstRewardReady": "Twoja pierwsza nagroda czeka!",
  "loyalty.firstRewardDesc": "Masz wystarczaj\u0105co punkt\u00f3w na:",
  "loyalty.expiresIn": "wygasa wkr\u00f3tce",
  "loyalty.expiresBefore": "Wykorzystaj przed",
  "loyalty.progressToNext": "Post\u0119p do poziomu",
  "loyalty.progressPoints": "Punkty",
  "loyalty.progressSpend": "Wydatki (PLN)",
  "loyalty.progressStays": "Pobyty",
  "loyalty.remaining": "Brakuje:",

  // -- Challenges -------------------------------------------------------------
  "challenge.sectionTitle": "Wyzwania",
  "challenge.completed": "Uko\u0144czone",
  "challenge.daysLeft": "Pozosta\u0142o dni",
  "challenge.reward": "Nagroda",
  "challenge.noChallenges": "Brak aktywnych wyzwa\u0144",
  "challenge.loadError": "Nie uda\u0142o si\u0119 za\u0142adowa\u0107 wyzwa\u0144.",

  // -- Badges -----------------------------------------------------------------
  "badge.sectionTitle": "Odznaki",
  "badge.earned": "Zdobyta",
  "badge.locked": "Zablokowana",
  "badge.earnedOn": "Zdobyto",
  "badge.noBadges": "Brak odznak",

  // -- ScratchCard ------------------------------------------------------------
  "scratch.title": "Zdrap i wygraj!",
  "scratch.tapToScratch": "Dotknij aby zdrapac",
  "scratch.revealing": "Odkrywanie...",
  "scratch.claim": "Odbierz nagrode",
  "scratch.claimed": "Nagroda odebrana!",
  "scratch.noWin": "Spr\u00f3buj nastepnym razem!",
  "scratch.pointsWin": "Wygra\u0142e\u015b {value} {pointsName}!",
  "scratch.discountWin": "zni\u017cki!",
  "scratch.error": "Nie uda\u0142o si\u0119 zdrapac.",
  "scratch.claimError": "Nie uda\u0142o si\u0119 odebra\u0107 nagrody.",

  // -- RewardsTab / categories ------------------------------------------------
  "cat.ROOM_UPGRADE": "Upgrade pokoju",
  "cat.LATE_CHECKOUT": "P\u00f3\u017ane wymeldowanie",
  "cat.EARLY_CHECKIN": "Wczesne zameldowanie",
  "cat.SPA_CREDIT": "SPA",
  "cat.FNB_CREDIT": "Gastronomia",
  "cat.WELCOME_DRINK": "Powitalny drink",
  "cat.PARKING": "Parking",
  "cat.DISCOUNT": "Zni\u017cka",
  "cat.EXPERIENCE": "Do\u015bwiadczenie",

  // -- RewardsTab / actions ---------------------------------------------------
  "rewards.loadError": "Nie uda\u0142o si\u0119 za\u0142adowa\u0107 nagr\u00f3d.",
  "rewards.redeemError": "Nie uda\u0142o si\u0119 wymieni\u0107 nagrody.",
  "rewards.availableToRedeem": "Dost\u0119pne do wymiany",
  "rewards.closeMessage": "Zamknij komunikat",
  "rewards.noRewards": "Brak dost\u0119pnych nagr\u00f3d",
  "rewards.noRewardsDesc": "Nowe nagrody pojawi\u0105 si\u0119 wkr\u00f3tce.",
  "rewards.noPoints": "Brak punkt\u00f3w",
  "rewards.unavailable": "Niedost\u0119pne",
  "rewards.redeem": "Wymie\u0144",
  "rewards.confirmTitle": "Wymieni\u0107 nagrod\u0119?",
  "rewards.currentBalance": "Aktualny stan:",
  "rewards.afterRedeem": "Po wymianie:",
  "rewards.cancel": "Anuluj",
  "rewards.successTitle": "Nagroda wymieniona!",
  "rewards.redemptionCode": "Kod realizacji:",
  "rewards.showAtReception": "Poka\u017c ten kod w recepcji.",
  "rewards.close": "Zamknij",
  "rewards.redeemAria": "Wymie\u0144 {name} za {cost} {pointsName}",

  // -- HotelTab ---------------------------------------------------------------
  "hotel.callAria": "Zadzwo\u0144: {phone}",
  "hotel.emailAria": "Napisz: {email}",
  "hotel.followUs": "Obserwuj nas",

  // -- MessagesTab ------------------------------------------------------------
  "msg.today": "Dzi\u015b",
  "msg.yesterday": "Wczoraj",
  "msg.sessionExpired": "Sesja wygas\u0142a",
  "msg.loadError": "Nie uda\u0142o si\u0119 za\u0142adowa\u0107 wiadomo\u015bci",
  "msg.sendExpired": "Sesja wygas\u0142a \u2014 od\u015bwie\u017c stron\u0119",
  "msg.you": "Ty",
  "msg.sendError": "Nie uda\u0142o si\u0119 wys\u0142a\u0107 wiadomo\u015bci",
  "msg.title": "Wiadomo\u015bci",
  "msg.chatWith": "Czat z",
  "msg.messagesLabel": "Wiadomo\u015bci",
  "msg.loading": "\u0141adowanie wiadomo\u015bci...",
  "msg.emptyTitle": "Napisz wiadomo\u015b\u0107 do hotelu",
  "msg.emptyDesc": "Odpowiemy najszybciej jak to mo\u017cliwe",
  "msg.retry": "Pon\u00f3w",
  "msg.closeMessage": "Zamknij komunikat",
  "msg.placeholder": "Napisz wiadomo\u015b\u0107...",
  "msg.textareaLabel": "Tre\u015b\u0107 wiadomo\u015bci",
  "msg.sendLabel": "Wy\u015blij wiadomo\u015b\u0107",
  "msg.keyboardHint": "Enter \u2014 wy\u015blij, Shift+Enter \u2014 nowa linia",
  "msg.loadOlder": "Za\u0142aduj starsze wiadomo\u015bci",
  "msg.loadingOlder": "\u0141adowanie...",

  // -- Mobile-specific --------------------------------------------------------
  "common.error": "Wyst\u0105pi\u0142 b\u0142\u0105d",
  "common.retry": "Spr\u00f3buj ponownie",
  "common.networkError": "Brak po\u0142\u0105czenia z sieci\u0105",
  "common.loading": "\u0141adowanie...",
  "common.pullToRefresh": "Poci\u0105gnij, aby od\u015bwie\u017cy\u0107",
  "common.close": "Zamknij",

  "auth.welcome": "Witaj w Pure Loyal",
  "auth.enterLink": "Wklej link z hotelu",
  "auth.invalidLink": "Nieprawid\u0142owy link",
  "auth.askHotel": "Zapytaj w recepcji o link do programu lojalno\u015bciowego",
  "auth.pasteLink": "Wklej link",
  "auth.open": "Otw\u00f3rz",

  "push.title": "Powiadomienia Pure Loyal",

  // -- Error Boundary ---------------------------------------------------------
  "error.fallback": "Co\u015b posz\u0142o nie tak",
  "error.retry": "Spr\u00f3buj ponownie",
};

const en: Record<string, string> = {
  // -- Shell / tabs -----------------------------------------------------------
  "tab.stay": "My Stay",
  "tab.loyalty": "Points",
  "tab.rewards": "Rewards",
  "tab.hotel": "Hotel",
  "tab.messages": "Messages",

  // -- Shell / misc -----------------------------------------------------------
  "shell.sessionExpired": "Session expired",
  "shell.sessionExpiredDesc": "Refresh the page to continue.",
  "shell.refresh": "Refresh",
  "shell.createAccount": "Create an account to manage points across all hotels.",
  "shell.register": "Register",
  "shell.closeBanner": "Close banner",
  "shell.navLabel": "Portal navigation",

  // -- StayTab ----------------------------------------------------------------
  "stay.greetMorning": "Good morning",
  "stay.greetAfternoon": "Welcome",
  "stay.greetEvening": "Good evening",
  "stay.guest": "Guest",
  "stay.highestTier": "Highest tier",
  "stay.stays": "Stays",
  "stay.earned": "Earned",
  "stay.multiplier": "Multiplier",
  "stay.hotelServices": "Hotel services",
  "stay.currency": "PLN",
  "stay.contactHotel": "Contact hotel",
  "stay.memberSince": "Member since",
  "stay.yourBenefits": "Your benefits",

  // -- LoyaltyTab / sources ---------------------------------------------------
  "source.BOOKING": "Booking",
  "source.CHECKIN": "Check-in",
  "source.CHECKOUT": "Check-out",
  "source.WIFI_LOGIN": "WiFi login",
  "source.REFERRAL": "Referral",
  "source.REVIEW": "Review",
  "source.MANUAL": "Awarded by hotel",
  "source.PROMOTION": "Promotion",
  "source.BIRTHDAY": "Birthday",
  "source.SPEND": "Hotel spend",
  "source.eco_housekeeping": "Skip housekeeping",
  "source.eco_receipt": "Digital receipt",
  "source.eco_bottle": "Reusable bottle / cup",
  "source.SIGNUP": "Signup",
  "source.SYSTEM": "System",

  // -- LoyaltyTab / sections --------------------------------------------------
  "loyalty.loadError": "Failed to load history.",
  "loyalty.multiplierLabel": "Multiplier:",
  "loyalty.discountLabel": "Discount:",
  "loyalty.summary": "Summary",
  "loyalty.available": "Available",
  "loyalty.lifetime": "Lifetime",
  "loyalty.pending": "Pending",
  "loyalty.history": "History",
  "loyalty.noHistory": "No transaction history",
  "loyalty.loadMore": "Load more",
  "loyalty.loadingMore": "Loading...",
  "loyalty.allTiers": "Program tiers",
  "loyalty.currentTier": "(current)",
  "loyalty.from": "from",
  "loyalty.multiplier": "multiplier",
  "loyalty.howToEarn": "How to earn",
  "loyalty.firstRewardReady": "Your first reward is ready!",
  "loyalty.firstRewardDesc": "You have enough points for:",
  "loyalty.expiresIn": "expiring soon",
  "loyalty.expiresBefore": "Use before",
  "loyalty.progressToNext": "Progress to",
  "loyalty.progressPoints": "Points",
  "loyalty.progressSpend": "Spend (PLN)",
  "loyalty.progressStays": "Stays",
  "loyalty.remaining": "Remaining:",

  // -- Challenges -------------------------------------------------------------
  "challenge.sectionTitle": "Challenges",
  "challenge.completed": "Completed",
  "challenge.daysLeft": "Days left",
  "challenge.reward": "Reward",
  "challenge.noChallenges": "No active challenges",
  "challenge.loadError": "Failed to load challenges.",

  // -- Badges -----------------------------------------------------------------
  "badge.sectionTitle": "Badges",
  "badge.earned": "Earned",
  "badge.locked": "Locked",
  "badge.earnedOn": "Earned on",
  "badge.noBadges": "No badges",

  // -- ScratchCard ------------------------------------------------------------
  "scratch.title": "Scratch & Win!",
  "scratch.tapToScratch": "Tap to scratch",
  "scratch.revealing": "Revealing...",
  "scratch.claim": "Claim reward",
  "scratch.claimed": "Reward claimed!",
  "scratch.noWin": "Try again next time!",
  "scratch.pointsWin": "You won {value} {pointsName}!",
  "scratch.discountWin": "discount!",
  "scratch.error": "Failed to scratch.",
  "scratch.claimError": "Failed to claim reward.",

  // -- RewardsTab / categories ------------------------------------------------
  "cat.ROOM_UPGRADE": "Room upgrade",
  "cat.LATE_CHECKOUT": "Late checkout",
  "cat.EARLY_CHECKIN": "Early check-in",
  "cat.SPA_CREDIT": "SPA",
  "cat.FNB_CREDIT": "Dining",
  "cat.WELCOME_DRINK": "Welcome drink",
  "cat.PARKING": "Parking",
  "cat.DISCOUNT": "Discount",
  "cat.EXPERIENCE": "Experience",

  // -- RewardsTab / actions ---------------------------------------------------
  "rewards.loadError": "Failed to load rewards.",
  "rewards.redeemError": "Failed to redeem reward.",
  "rewards.availableToRedeem": "Available to redeem",
  "rewards.closeMessage": "Close message",
  "rewards.noRewards": "No rewards available",
  "rewards.noRewardsDesc": "New rewards coming soon.",
  "rewards.noPoints": "Not enough points",
  "rewards.unavailable": "Unavailable",
  "rewards.redeem": "Redeem",
  "rewards.confirmTitle": "Redeem reward?",
  "rewards.currentBalance": "Current balance:",
  "rewards.afterRedeem": "After redemption:",
  "rewards.cancel": "Cancel",
  "rewards.successTitle": "Reward redeemed!",
  "rewards.redemptionCode": "Redemption code:",
  "rewards.showAtReception": "Show this code at reception.",
  "rewards.close": "Close",
  "rewards.redeemAria": "Redeem {name} for {cost} {pointsName}",

  // -- HotelTab ---------------------------------------------------------------
  "hotel.callAria": "Call: {phone}",
  "hotel.emailAria": "Email: {email}",
  "hotel.followUs": "Follow us",

  // -- MessagesTab ------------------------------------------------------------
  "msg.today": "Today",
  "msg.yesterday": "Yesterday",
  "msg.sessionExpired": "Session expired",
  "msg.loadError": "Failed to load messages",
  "msg.sendExpired": "Session expired \u2014 refresh page",
  "msg.you": "You",
  "msg.sendError": "Failed to send message",
  "msg.title": "Messages",
  "msg.chatWith": "Chat with",
  "msg.messagesLabel": "Messages",
  "msg.loading": "Loading messages...",
  "msg.emptyTitle": "Write a message to the hotel",
  "msg.emptyDesc": "We will reply as soon as possible",
  "msg.retry": "Retry",
  "msg.closeMessage": "Close message",
  "msg.placeholder": "Write a message...",
  "msg.textareaLabel": "Message content",
  "msg.sendLabel": "Send message",
  "msg.keyboardHint": "Enter \u2014 send, Shift+Enter \u2014 new line",
  "msg.loadOlder": "Load older messages",
  "msg.loadingOlder": "Loading...",

  // -- Mobile-specific --------------------------------------------------------
  "common.error": "An error occurred",
  "common.retry": "Try again",
  "common.networkError": "No network connection",
  "common.loading": "Loading...",
  "common.pullToRefresh": "Pull to refresh",
  "common.close": "Close",

  "auth.welcome": "Welcome to Pure Loyal",
  "auth.enterLink": "Paste your hotel link",
  "auth.invalidLink": "Invalid link",
  "auth.askHotel": "Ask the reception for your loyalty program link",
  "auth.pasteLink": "Paste link",
  "auth.open": "Open",

  "push.title": "Pure Loyal Notifications",

  // -- Error Boundary ---------------------------------------------------------
  "error.fallback": "Something went wrong",
  "error.retry": "Try again",
};

const dicts: Record<Lang, Record<string, string>> = { pl, en };

export function t(lang: Lang, key: string): string {
  return dicts[lang]?.[key] ?? dicts.pl[key] ?? key;
}
