"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { getDbUserProfile, type DbUserProfile } from "@/lib/apiClient";
import {
  getImpersonationState,
  useImpersonationCacheKey,
} from "@/lib/impersonation";
import ContextMenu from "./ContextMenu";
import styles from "./UserProfile.module.css";

interface UserProfileProps {
  isAdmin?: boolean;
  onViewChange?: (view: string) => void;
  onOpenSettings?: () => void;
}

export default function UserProfile({ isAdmin = false, onViewChange, onOpenSettings }: UserProfileProps) {
  const { user, getAccessTokenSilently } = useAuth0();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [dbProfile, setDbProfile] = useState<DbUserProfile | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const identityKey = useImpersonationCacheKey();
  const impersonation = getImpersonationState();

  // Fetch DB profile (target user while proxying via X-Impersonate-User-Id).
  useEffect(() => {
    let cancelled = false;
    setDbProfile(null);
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const profile = await getDbUserProfile(token);
        if (!cancelled) {
          setDbProfile(profile);
        }
      } catch {
        // Non-fatal — fall back to Auth0 / impersonation email
      }
    })();
    return () => { cancelled = true; };
  }, [getAccessTokenSilently, identityKey]);

  // Listen for instant avatar update from WelcomeModal after upload
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent<{ picture_url: string }>).detail?.picture_url;
      if (url) {
        setDbProfile((prev) => ({ ...(prev ?? {}), picture: url }));
      }
    };
    window.addEventListener("tc:avatar-updated", handler);
    return () => window.removeEventListener("tc:avatar-updated", handler);
  }, []);

  // Close menu when clicking outside (wrapper = profile + menu)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  const getInitial = (): string => {
    if (dbProfile?.first_name) {
      return dbProfile.first_name[0].toUpperCase();
    }
    if (dbProfile?.last_name) {
      return dbProfile.last_name[0].toUpperCase();
    }
    // While proxying, never fall back to the admin's Auth0 identity.
    if (impersonation?.email) {
      return impersonation.email[0].toUpperCase();
    }
    if (user?.name) {
      return user.name[0].toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const pictureUrl =
    dbProfile?.picture ||
    (impersonation ? null : user?.picture) ||
    null;

  return (
    <div ref={wrapperRef} style={{ position: "relative", overflow: "visible" }}>
      <div
        ref={profileRef}
        className={styles.userProfile}
        id="user-profile"
        onClick={toggleMenu}
      >
        <div
          className={`${styles.userAvatar} ${isAdmin ? styles.adminAvatar : ""}` }
          id="user-avatar"
          title={isAdmin ? "Administrator" : ""}
        >
          {pictureUrl ? (
            <img src={pictureUrl} alt="User avatar" loading="lazy" />
          ) : (
            getInitial()
          )}
        </div>
      </div>
      <ContextMenu
        ref={menuRef}
        isOpen={isMenuOpen}
        isAdmin={isAdmin}
        onClose={() => setIsMenuOpen(false)}
        onViewChange={onViewChange}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}
