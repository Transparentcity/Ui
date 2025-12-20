"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import ContextMenu from "./ContextMenu";
import styles from "./UserProfile.module.css";

interface UserProfileProps {
  isAdmin?: boolean;
  onViewChange?: (view: string) => void;
}

export default function UserProfile({ isAdmin = false, onViewChange }: UserProfileProps) {
  const { user } = useAuth0();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        profileRef.current &&
        menuRef.current &&
        !profileRef.current.contains(target) &&
        !menuRef.current.contains(target)
      ) {
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

  return (
    <>
      <div
        ref={profileRef}
        className={styles.userProfile}
        id="user-profile"
        onClick={toggleMenu}
        style={{ position: "relative" }}
      >
        <div
          className={`${styles.userAvatar} ${isAdmin ? styles.adminAvatar : ""}` }
          id="user-avatar"
          title={isAdmin ? "Administrator" : ""}
        >
          {user?.picture ? (
            <img src={user.picture} alt="User avatar" loading="lazy" />
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
      />
    </>
  );
}

