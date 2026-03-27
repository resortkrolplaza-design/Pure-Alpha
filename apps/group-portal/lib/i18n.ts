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
  "auth.enterPin": "Wprowadź PIN",
  "auth.logout": "Wyloguj się",
  "auth.tokenExpired": "Sesja wygasła. Zaloguj się ponownie.",
  "auth.error": "Błąd",

  // ── Common ----
  "common.loading": "Ładowanie...",
  "common.error": "Wystąpił błąd",
  "common.retry": "Spróbuj ponownie",
  "common.cancel": "Anuluj",
  "common.confirm": "Potwierdź",
  "common.save": "Zapisz",
  "common.close": "Zamknij",
  "common.back": "Wróć",
  "common.noData": "Brak danych",
  "common.seeAll": "Zobacz wszystkie",
  "common.delete": "Usuń",
  "common.sessionExpired": "Sesja wygasła. Zaloguj się ponownie.",
  "common.networkError": "Brak połączenia z siecią",

  // ── Group Portal ----
  "group.tab.overview": "Przegląd",
  "group.tab.guests": "Goście",
  "group.tab.messages": "Wiadomości",
  "group.tab.documents": "Dokumenty",
  "group.tab.photos": "Zdjęcia",
  "group.agenda": "Agenda",
  "group.announcements": "Ogłoszenia",
  "group.countdown": "Do wydarzenia",
  "group.rsvp": "Potwierdź obecność",
  "group.guestList": "Lista gości",
  "group.organizer": "Organizator",
  "group.rsvp.confirmed": "Potwierdzone",
  "group.rsvp.declined": "Odrzucone",
  "group.rsvp.pending": "Oczekuje",
  "group.photosCount": "zdjęć",
  "group.enterPinPrompt": "Wprowadź PIN, aby zobaczyć dane",
  "group.countdownDays": "dni",
  "group.eventInProgress": "Trwa!",
  "group.eventEnded": "Zakończone",
  "group.logout": "Wyloguj się",
  "group.logoutConfirm": "Czy na pewno chcesz się wylogować?",
  "group.language": "Język",

  // ── PIN Auth ----
  "pin.enterTrackingId": "Wprowadź ID wydarzenia",
  "pin.invalidPin": "Nieprawidłowy PIN",
  "pin.trackingIdPlaceholder": "ID wydarzenia",
  "pin.emailOptionalPlaceholder": "Email (opcjonalnie)",
  "pin.protectedByPin": "Portal chroniony PIN-em",
  "pin.enterCodeFromHotel": "Wprowadź 6-cyfrowy kod, który otrzymałeś od hotelu",
  "pin.yourEmail": "Twój adres email",
  "pin.emailHint": "Podając email pozwalasz na identyfikację w portalu wydarzenia.",
  "pin.eventId": "ID wydarzenia",
  "pin.codeSentByEmail": "Kod PIN został wysłany w wiadomości email od hotelu",
  "pin.forgotPin": "Nie pamiętam PIN-u",
  "pin.forgotPinHint": "Skontaktuj się z recepcją hotelu lub organizatorem wydarzenia, aby otrzymać nowy PIN.",

  // ── Messages ----
  "messages.title": "Wiadomości",
  "messages.placeholder": "Napisz wiadomość...",
  "messages.send": "Wyślij",
  "messages.empty": "Brak wiadomości. Napisz do nas!",
  "messages.loadOlder": "Załaduj starsze",
  "messages.today": "Dzisiaj",
  "messages.yesterday": "Wczoraj",
  "messages.sendFailed": "Nie udało się wysłać",
  "messages.errorLoading": "Nie udało się załadować wiadomości",
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
  "group.logout": "Log out",
  "group.logoutConfirm": "Are you sure you want to log out?",
  "group.language": "Language",

  // ── PIN Auth ----
  "pin.enterTrackingId": "Enter event ID",
  "pin.invalidPin": "Invalid PIN",
  "pin.trackingIdPlaceholder": "Event ID",
  "pin.emailOptionalPlaceholder": "Email (optional)",
  "pin.protectedByPin": "Portal protected by PIN",
  "pin.enterCodeFromHotel": "Enter the 6-digit code you received from the hotel",
  "pin.yourEmail": "Your email address",
  "pin.emailHint": "By providing your email you allow identification in the event portal.",
  "pin.eventId": "Event ID",
  "pin.codeSentByEmail": "PIN code was sent in an email from the hotel",
  "pin.forgotPin": "I forgot my PIN",
  "pin.forgotPinHint": "Contact the hotel reception or event organizer to receive a new PIN.",

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
