"use client";

import { CalendarDays, FolderTree, LayoutTemplate, LogOut, Paperclip, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { UserDTO } from "@/lib/types";
import { CommandPalette } from "./CommandPalette";
import { cx, modLabel, ToastProvider } from "./ui";

const NAV = [
  { href: "/settimana", label: "Settimana", icon: CalendarDays },
  { href: "/cartelle", label: "Cartelle", icon: FolderTree },
  { href: "/esercizi", label: "Esercizi", icon: Paperclip },
  { href: "/modelli", label: "Modelli", icon: LayoutTemplate },
  { href: "/impostazioni", label: "Impostazioni", icon: Settings },
];

function NavLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex gap-1 md:flex-col" aria-label="Sezioni">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname?.startsWith(href) ?? false;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 font-medium transition-colors",
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
      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 font-medium text-muted hover:bg-sunken hover:text-ink md:mt-2 md:border md:border-line"
      aria-label="Cerca"
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 text-left max-md:sr-only">Cerca</span>
      <kbd className="text-xs max-md:hidden">{hint}</kbd>
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-line bg-paper px-3 py-2 md:h-screen md:w-52 md:flex-col md:items-stretch md:justify-start md:border-r md:border-b-0 md:px-3 md:py-4 print:hidden">
          <Link href="/settimana" className="font-display text-xl font-semibold tracking-tight md:mb-4 md:px-2.5">
            Piano<span className="text-accent">Studio</span>
          </Link>
          <Suspense fallback={<NavLinks pathname={null} />}>
            <ActiveNav />
          </Suspense>
          <SearchButton />
          <div className="md:mt-auto">
            <UserBox />
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
