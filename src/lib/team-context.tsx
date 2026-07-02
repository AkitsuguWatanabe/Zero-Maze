"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type TeamContextValue = {
  selectedTeamId: string;
  setSelectedTeamId: (id: string) => void;
};

const TeamContext = createContext<TeamContextValue | undefined>(undefined);

const STORAGE_KEY = "zero-maze:selected-team-id";

export function TeamProvider({ children }: { children: ReactNode }) {
  const [selectedTeamId, setSelectedTeamIdState] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setSelectedTeamIdState(stored);
    } catch {
      // ignore (e.g. private browsing)
    } finally {
      setHydrated(true);
    }
  }, []);

  function setSelectedTeamId(id: string) {
    setSelectedTeamIdState(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <TeamContext.Provider value={{ selectedTeamId: hydrated ? selectedTeamId : "", setSelectedTeamId }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useTeam must be used within a TeamProvider");
  return ctx;
}