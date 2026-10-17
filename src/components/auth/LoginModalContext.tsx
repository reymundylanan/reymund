"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AUTH_ERROR_TEXT, type AuthError } from "@/lib/auth/oauthRedirect";
import LoginModal from "@/components/auth/LoginModal";

type LoginModalContextValue = {
  open: () => void;
  isOpen: boolean;
};

const LoginModalContext = createContext<LoginModalContextValue | null>(null);

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Back from Google / Facebook without logging in: reopen Login with why.
  useEffect(() => {
    const url = new URL(window.location.href);
    const reason = url.searchParams.get("auth_error") as AuthError | null;
    if (!reason) return;
    url.searchParams.delete("auth_error");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once on arrival
    setNotice(AUTH_ERROR_TEXT[reason] ?? AUTH_ERROR_TEXT.failed);
    setIsOpen(true);
  }, []);

  return (
    <LoginModalContext.Provider value={{ open: () => setIsOpen(true), isOpen }}>
      {children}
      {isOpen && (
        <LoginModal
          notice={notice}
          onClose={() => {
            setIsOpen(false);
            setNotice(null);
          }}
        />
      )}
    </LoginModalContext.Provider>
  );
}

export function useLoginModal() {
  const ctx = useContext(LoginModalContext);
  if (!ctx) throw new Error("useLoginModal must be used within LoginModalProvider");
  return ctx;
}
