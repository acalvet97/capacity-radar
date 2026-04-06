"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { DashboardSnapshot } from "@/lib/dashboardEngine";
import type { EvaluateChatMessage } from "@/lib/evaluateChatTypes";
import { AskKlyraModal } from "@/components/evaluate/AskKlyraModal";

interface AskKlyraContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  messages: EvaluateChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<EvaluateChatMessage[]>>;
  clearMessages: () => void;
  /** True while a chat request is in-flight (including streaming). */
  isResponding: boolean;
  setIsResponding: (v: boolean) => void;
}

const AskKlyraContext = React.createContext<AskKlyraContextValue | null>(null);

export function useAskKlyra(): AskKlyraContextValue {
  const ctx = React.useContext(AskKlyraContext);
  if (!ctx) throw new Error("useAskKlyra must be used within AskKlyraProvider");
  return ctx;
}

interface AskKlyraProviderProps {
  children: React.ReactNode;
  /** Null when the snapshot fetch failed (e.g. during onboarding). The modal
   *  is suppressed in that case but the provider still wraps the tree so
   *  EvaluateClient can safely call useAskKlyra(). */
  snapshot: DashboardSnapshot | null;
  todayYmd: string;
  displayName: string;
}

export function AskKlyraProvider({
  children,
  snapshot,
  todayYmd,
  displayName,
}: AskKlyraProviderProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<EvaluateChatMessage[]>([]);
  const [isResponding, setIsResponding] = React.useState(false);

  const open = React.useCallback(() => setIsOpen(true), []);
  const close = React.useCallback(() => setIsOpen(false), []);
  const toggle = React.useCallback(() => setIsOpen((prev) => !prev), []);
  const clearMessages = React.useCallback(() => setMessages([]), []);

  // Close the modal when navigating to /evaluate — the full-page EvaluateClient
  // takes over, preventing two instances from being alive simultaneously.
  React.useEffect(() => {
    if (pathname === "/evaluate") {
      setIsOpen(false);
    }
  }, [pathname]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Already on the full Ask Klyra page — shortcut is a no-op.
        if (pathname === "/evaluate") return;
        // No snapshot means the modal can't render — skip silently.
        if (!snapshot) return;
        toggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle, pathname, snapshot]);

  return (
    <AskKlyraContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        messages,
        setMessages,
        clearMessages,
        isResponding,
        setIsResponding,
      }}
    >
      {children}
      {isOpen && snapshot && (
        <AskKlyraModal
          onClose={close}
          snapshot={snapshot}
          todayYmd={todayYmd}
          displayName={displayName}
        />
      )}
    </AskKlyraContext.Provider>
  );
}
