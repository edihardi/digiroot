import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { SettingsModalProvider } from "@/components/SettingsModalContext";
import SettingsModal from "@/components/SettingsModal";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = await isAuthenticated();
  if (!authed) redirect("/login");

  return (
    <ToastProvider>
      <SettingsModalProvider>
        <div className="flex min-h-screen flex-col bg-zinc-950 md:flex-row">
          <Sidebar />
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
        <SettingsModal />
      </SettingsModalProvider>
    </ToastProvider>
  );
}
