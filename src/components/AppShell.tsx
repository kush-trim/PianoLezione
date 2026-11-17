"use client";

import { Bell, CalendarDays, FolderTree, LayoutTemplate, LogOut, Paperclip, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "@/lib/api";
import { applyTheme, forgetTheme, themeFromSettings } from "@/lib/theme-client";
import type { NotificationsDTO, SettingsDTO, UserDTO } from "@/lib/types";
import { CommandPalette } from "./CommandPalette";
import { cx, modLabel, ToastProvider } from "./ui";

const NAV = [
  { href: "/settimana", label: "Settimana", icon: CalendarDays },
  { href: "/piani", label: "Piano Lezione", icon: FolderTree },
  { href: "/file", label: "File", icon: Paperclip },
  { href: "/modelli", label: "Modelli", icon: LayoutTemplate },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex gap-0.5 md:flex-col md:gap-1" aria-label="Sezioni">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href) ?? false;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2.5 rounded-md px-2 py-2 font-medium transition-colors md:px-2.5",
              active ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="max-md:sr-only">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// usePathname sospende nelle route con parametri dinamici: va isolato in Suspense.
function ActiveNav() {
  return <NavLinks pathname={usePathname()} />;
}

function UserBox() {
  const [user, setUser] = useState<UserDTO | null>(null);
  useEffect(() => {
    api.get<UserDTO>("/api/auth/me").then(setUser, () => {});
  }, []);

  async function logout() {
    await api.post("/api/auth/logout").catch(() => {});
    forgetTheme();
    // Ricarica completa voluta: lo stato in memoria dipende dalla sessione.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return (
    <div className="flex items-center gap-2 md:border-t md:border-line md:pt-3">
      <div className="min-w-0 flex-1 max-md:hidden">
        <p className="truncate font-medium">{user?.name ?? " "}</p>
        <p className="truncate text-xs text-muted">{user?.email ?? " "}</p>
      </div>
      <button
        type="button"
        onClick={logout}
        title="Esci"
        aria-label="Esci"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

/** Evento da lanciare quando le notifiche cambiano (es. dopo aver accettato un invito). */
export const NOTIFICATIONS_CHANGED = "pianostudio:notifiche";

/** Campanella con il numero di inviti e avvisi da leggere; si aggiorna da sola. */
function NotificationsLink({ pathname }: { pathname: string | null }) {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let stale = false;
    const load = () => api.get<NotificationsDTO>("/api/notifications").then((n) => !stale && setUnread(n.unread), () => {});
    load();
    const every = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      stale = true;
      clearInterval(every);
      window.removeEventListener("focus", load);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, []);
  const active = pathname?.startsWith("/notifiche") ?? false;
  return (
    <Link
      href="/notifiche"
      aria-current={active ? "page" : undefined}
      aria-label={unread ? `Notifiche, ${unread} da leggere` : "Notifiche"}
      className={cx(
        "flex items-center gap-2.5 rounded-md px-2 py-2 font-medium transition-colors md:px-2.5",
        active ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-ink",
      )}
    >
      <span className="relative">
        <Bell className="size-4 shrink-0" aria-hidden />
        {unread > 0 && (
          <span className="tabular absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-semibold text-on-danger">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
      <span className="max-md:sr-only">Notifiche</span>
    </Link>
  );
}

function ActiveNotifications() {
  return <NotificationsLink pathname={usePathname()} />;
}

/** Apre la ricerca rapida: stessa cosa di ⌘K / Ctrl+K. */
function SearchButton() {
  // La scorciatoia dipende dal sistema: sul server non si scrive.
  const hint = useSyncExternalStore(
    () => () => {},
    () => `${modLabel()}K`,
    () => "",
  );
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }))}
      className="flex items-center gap-2.5 rounded-md px-2 py-2 font-medium text-muted hover:bg-sunken hover:text-ink md:mt-2 md:border md:border-line md:px-2.5"
      aria-label="Cerca"
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 text-left max-md:sr-only">Cerca</span>
      <kbd className="text-xs max-md:hidden">{hint}</kbd>
    </button>
  );
}

/**
 * Allinea il tema a quello salvato nell'account. Di solito è già quello giusto
 * (lo script in <head> riapplica l'ultima copia); serve su un browser nuovo o
 * dopo un cambio fatto da un altro dispositivo.
 */
function ThemeSync() {
  useEffect(() => {
    api.get<SettingsDTO>("/api/settings").then((s) => applyTheme(themeFromSettings(s)), () => {});
  }, []);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ThemeSync />
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-1 border-b border-line bg-paper px-3 py-2 md:h-screen md:w-52 md:flex-col md:items-stretch md:justify-start md:gap-3 md:border-r md:border-b-0 md:px-3 md:py-4 print:hidden">
          <Link href="/settimana" className="font-display text-xl font-semibold tracking-tight md:mb-4 md:px-2.5">
            P<span className="max-[439px]:hidden">iano</span>
            <span className="text-accent">
              S<span className="max-[439px]:hidden">tudio</span>
            </span>
          </Link>
          <div className="flex items-center gap-0.5 md:contents">
            <Suspense fallback={<NavLinks pathname={null} />}>
              <ActiveNav />
            </Suspense>
            <Suspense fallback={<NotificationsLink pathname={null} />}>
              <ActiveNotifications />
            </Suspense>
            <SearchButton />
            <div className="md:mt-auto">
              <UserBox />
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">
          <Suspense>{children}</Suspense>
        </main>
        <CommandPalette />
      </div>
    </ToastProvider>
  );
}
