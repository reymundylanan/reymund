"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import LoginModal from "@/components/auth/LoginModal";

type LoginModalContextValue = {
  open: () => void;
};

const LoginModalContext = createContext<LoginModalContextValue | null>(null);

export function LoginModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <LoginModalContext.Provider value={{ open: () => setIsOpen(true) }}>
      {children}
      {isOpen && <LoginModal onClose={() => setIsOpen(false)} />}
    </LoginModalContext.Provider>
  );
}

export function useLoginModal() {
  const ctx = useContext(LoginModalContext);
  if (!ctx) throw new Error("useLoginModal must be used within LoginModalProvider");
  return ctx;
}
