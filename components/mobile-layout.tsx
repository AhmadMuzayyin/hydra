"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Home, LogOut, Settings as SettingsIcon, Power } from "lucide-react";
import { logoutAction } from "@/app/actions";

const tabs = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/kontrol", label: "Kontrol", icon: Power },
  { to: "/jadwal", label: "Jadwal", icon: Calendar },
  { to: "/pengaturan", label: "Pengaturan", icon: SettingsIcon },
] as const;

export function MobileLayout({
  children,
  title,
  role,
}: {
  children: React.ReactNode;
  title: string;
  role?: string;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-30 bg-primary text-white px-5 py-4 shadow-[var(--shadow-card)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <div>
            <h2 className="text-xl uppercase tracking-[0.28em] font-bold">Hydra</h2>
            <p className="text-xs leading-tight">
              {title}
              {role ? ` • ${role}` : ""}
            </p>
          </div>
          <form action={logoutAction}>
            <button
              aria-label="Logout"
              className="grid h-11 w-11 place-items-center rounded-full bg-white/20 transition hover:bg-white/30"
              type="submit"
            >
              <LogOut className="h-5 w-5 text-white" />
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 pb-28">{children}</main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card">
        <ul className="mx-auto grid max-w-2xl grid-cols-4">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.to);
            const Icon = tab.icon;

            return (
              <li key={tab.to}>
                <Link
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] transition ${active ? "font-semibold text-primary" : "text-muted-foreground"}`}
                  href={tab.to}
                >
                  <Icon className={`h-5 w-5 transition-transform ${active ? "scale-110" : ""}`} />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
