import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { fetchJSON, sendJSON } from "@web-speed-hackathon-2026/client/src/utils/fetchers";

interface ReturnValues {
  activeUser: Models.User | null;
  refreshActiveUser: () => Promise<void>;
  updateActiveUser: (user: Models.User | null) => void;
  logout: () => Promise<void>;
}

export function useAuthSession(): ReturnValues {
  const navigate = useNavigate();
  const [activeUser, setActiveUser] = useState<Models.User | null>(null);
  const authStateVersionRef = useRef(0);

  const updateActiveUser = useCallback((user: Models.User | null) => {
    authStateVersionRef.current += 1;
    setActiveUser(user);
  }, []);

  const refreshActiveUser = useCallback(() => {
    const requestVersion = authStateVersionRef.current;

    return fetchJSON<Models.User>("/api/v1/me")
      .then((user) => {
        if (requestVersion === authStateVersionRef.current) {
          setActiveUser(user);
        }
      })
      .catch(() => {
        if (requestVersion === authStateVersionRef.current) {
          setActiveUser(null);
        }
      });
  }, []);

  useEffect(() => {
    void refreshActiveUser();
  }, [refreshActiveUser]);

  const logout = useCallback(async () => {
    await sendJSON("/api/v1/signout", {});
    updateActiveUser(null);
    navigate("/");
  }, [navigate, updateActiveUser]);

  return {
    activeUser,
    refreshActiveUser,
    updateActiveUser,
    logout,
  };
}
