// =============================================================================
// Group Portal — i18n (PL + EN)
// =============================================================================

export type Lang = "pl" | "en";

const pl: Record<string, string> = {
  // ── Mode Selector ----
  "mode.title": "Pure Alpha",
  "mode.subtitle": "Portal Grupy",
  "mode.group": "Portal Grupy",
  "mode.groupDesc": "Wydarzenie grupowe",

  // ── Auth ----
  "auth.login": "Zaloguj się",
  "auth.enterPin": "Wprowadz PIN",
  "auth.logout": "Wyloguj sie",
  "auth.tokenExpired": "Sesja wygasla. Zaloguj sie ponownie.",
  "auth.error": "Blad",

  // ── Common ----
  "common.loading": "Ladowanie...",
  "common.error": "Wystapil blad",
  "common.retry": "Sprobuj ponownie",
  "common.cancel": "Anuluj",
  "common.confirm": "Potwierdz",
  "common.save": "Zapisz",
  "common.close": "Zamknij",
  "common.back": "Wroc",
  "common.noData": "Brak danych",
  "common.seeAll": "Zobacz wszystkie",
  "common.delete": "Usun",
  "common.sessionExpired": "Sesja wygasla. Zaloguj sie ponownie.",
  "common.networkError": "Brak polaczenia z siecia",

  // ── Group Portal ----
  "group.tab.overview": "Przeglad",
  "group.tab.guests": "Goscie",
  "group.tab.messages": "Wiadomosci",
  "group.tab.documents": "Dokumenty",
  "group.tab.photos": "Zdjecia",
  "group.agenda": "Agenda",
  "group.announcements": "Ogloszenia",
  "group.countdown": "Do wydarzenia",
  "group.rsvp": "Potwierdz obecnosc",
  "group.guestList": "Lista gosci",
  "group.organizer": "Organizator",
  "group.rsvp.confirmed": "Potwierdzone",
  "group.rsvp.declined": "Odrzucone",
  "group.rsvp.pending": "Oczekuje",
  "group.photosCount": "zdjec",
  "group.enterPinPrompt": "Wprowadz PIN aby zobaczyc dane",
  "group.countdownDays": "dni",
  "group.eventInProgress": "Trwa!",
  "group.eventEnded": "Zakonczone",

  // ── PIN Auth ----
  "pin.enterTrackingId": "Wprowadz ID wydarzenia",
  "pin.invalidPin": "Nieprawidlowy PIN",
  "pin.trackingIdPlaceholder": "ID wydarzenia (trackingId)",
  "pin.emailOptionalPlaceholder": "Email (opcjonalnie)",

  // ── Messages ----
  "messages.title": "Wiadomosci",
  "messages.placeholder": "Napisz wiadomosc...",
  "messages.send": "Wyslij",
  "messages.empty": "Brak wiadomosci. Napisz do nas!",
  "messages.loadOlder": "Zaladuj starsze",
  "messages.today": "Dzisiaj",
  "messages.yesterday": "Wczoraj",
  "messages.sendFailed": "Nie udalo sie wyslac",
  "messages.errorLoading": "Nie udalo sie zaladowac wiadomosci",
};

const en: Record<string, string> = {
  // ── Mode Selector ----
  "mode.title": "Pure Alpha",
  "mode.subtitle": "Group Portal",
  "mode.group": "Group Portal",
  "mode.groupDesc": "Group event",

  // ── Auth ----
  "auth.login": "Log in",
  "auth.enterPin": "Enter PIN",
  "auth.logout": "Log out",
  "auth.tokenExpired": "Session expired. Please log in again.",
  "auth.error": "Error",

  // ── Common ----
  "common.loading": "Loading...",
  "common.error": "An error occurred",
  "common.retry": "Try again",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.save": "Save",
  "common.close": "Close",
  "common.back": "Back",
  "common.noData": "No data",
  "common.seeAll": "See all",
  "common.delete": "Delete",
  "common.sessionExpired": "Session expired. Please log in again.",
  "common.networkError": "No network connection",

  // ── Group Portal ----
  "group.tab.overview": "Overview",
  "group.tab.guests": "Guests",
  "group.tab.messages": "Messages",
  "group.tab.documents": "Documents",
  "group.tab.photos": "Photos",
  "group.agenda": "Agenda",
  "group.announcements": "Announcements",
  "group.countdown": "Until event",
  "group.rsvp": "Confirm attendance",
  "group.guestList": "Guest list",
  "group.organizer": "Organizer",
  "group.rsvp.confirmed": "Confirmed",
  "group.rsvp.declined": "Declined",
  "group.rsvp.pending": "Pending",
  "group.photosCount": "photos",
  "group.enterPinPrompt": "Enter PIN to see event data",
  "group.countdownDays": "days",
  "group.eventInProgress": "In progress!",
  "group.eventEnded": "Ended",

  // ── PIN Auth ----
  "pin.enterTrackingId": "Enter event ID",
  "pin.invalidPin": "Invalid PIN",
  "pin.trackingIdPlaceholder": "Event ID (trackingId)",
  "pin.emailOptionalPlaceholder": "Email (optional)",

  // ── Messages ----
  "messages.title": "Messages",
  "messages.placeholder": "Type a message...",
  "messages.send": "Send",
  "messages.empty": "No messages yet. Write to us!",
  "messages.loadOlder": "Load older",
  "messages.today": "Today",
  "messages.yesterday": "Yesterday",
  "messages.sendFailed": "Failed to send message",
  "messages.errorLoading": "Failed to load messages",
};

const dicts: Record<Lang, Record<string, string>> = { pl, en };

export function t(lang: Lang, key: string): string {
  return dicts[lang]?.[key] ?? dicts.pl[key] ?? key;
}
