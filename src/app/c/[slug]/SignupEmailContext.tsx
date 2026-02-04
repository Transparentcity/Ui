"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type SignupEmailContextType = {
  email: string;
  setEmail: (email: string) => void;
};

const SignupEmailContext = createContext<SignupEmailContextType | null>(null);

export function SignupEmailProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState("");
  return (
    <SignupEmailContext.Provider value={{ email, setEmail }}>
      {children}
    </SignupEmailContext.Provider>
  );
}

export function useSignupEmail() {
  const context = useContext(SignupEmailContext);
  if (!context) {
    return { email: "", setEmail: () => {} };
  }
  return context;
}
