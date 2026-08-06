import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/providers/auth-provider";
import { Sidebar } from "@/widgets/shell/sidebar";
import { SettingsSidebar } from "@/widgets/shell/settings-sidebar";
import { Topbar } from "@/widgets/shell/topbar";
import { CommandPalette } from "@/widgets/shell/command-palette";
import { NotificationsDrawer } from "@/widgets/shell/notifications-drawer";

// App shell: sidebar + topbar + content outlet + global palette/drawers.
// Rendered under ProtectedRoute so `user` is guaranteed here.
export function Shell() {
  const { user } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!user) return null;
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--shell-bg)",
      }}
    >
      <Sidebar onOpenPalette={openPalette} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          height: "100%",
        }}
      >
        <Topbar
          onOpenPalette={openPalette}
          onOpenNotifications={() => setNotifOpen(true)}
        />
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
            padding: "24px 28px",
            position: "relative",
          }}
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      {notifOpen ? (
        <NotificationsDrawer onClose={() => setNotifOpen(false)} />
      ) : null}
    </div>
  );
}

// Settings area: same chrome but with its OWN sidebar (Lupus SettingsLayout).
// Never renders the core sidebar alongside it.
export function SettingsShell() {
  const { user } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const openPalette = useCallback(() => setPaletteOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!user) return null;
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--shell-bg)",
      }}
    >
      <SettingsSidebar />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          height: "100%",
        }}
      >
        <Topbar
          onOpenPalette={openPalette}
          onOpenNotifications={() => setNotifOpen(true)}
        />
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
            padding: "24px 28px",
            position: "relative",
          }}
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      {notifOpen ? (
        <NotificationsDrawer onClose={() => setNotifOpen(false)} />
      ) : null}
    </div>
  );
}
