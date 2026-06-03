"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { getDbUserProfile } from "@/lib/apiClient";
import ContextMenu from "./ContextMenu";
import styles from "./UserProfile.module.css";

interface UserProfileProps {
  isAdmin?: boolean;
  cityLeadCityIds?: number[];
  onViewChange?: (view: string) => void;
}

export default function UserProfile({ isAdmin = false, cityLeadCityIds = [], onViewChange }: UserProfileProps) {
  const { user, getAccessTokenSilently } = useAuth0();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [dbPicture, setDbPicture] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch DB profile to get uploaded picture (may differ from Auth0 picture)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const profile = await getDbUserProfile(token);
        if (!cancelled && profile.picture) {
          setDbPicture(profile.picture);
        }
      } catch {
        // Non-fatal — fall back to Auth0 picture
      }
    })();
    return () => { cancelled = true; };
  }, [getAccessTokenSilently]);

  // Listen for instant avatar update from WelcomeModal after upload
  useEffect(() => {
    const handler = (e: Event) => {
      const url = (e as CustomEvent<{ picture_url: string }>).detail?.picture_url;
      if (url) setDbPicture(url);
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

  const pictureUrl = dbPicture || user?.picture || null;

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
        cityLeadCityIds={cityLeadCityIds}
        onClose={() => setIsMenuOpen(false)}
        onViewChange={onViewChange}
      />
    </div>
  );
}


