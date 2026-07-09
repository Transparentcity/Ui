"use client";

import { forwardRef } from "react";
import UserMenuPanel from "./UserMenuPanel";
import styles from "./ContextMenu.module.css";

interface ContextMenuProps {
  isOpen: boolean;
  isAdmin?: boolean;
  onClose: () => void;
  onViewChange?: (view: string) => void;
  onOpenSettings?: () => void;
}

const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(
  ({ isOpen, isAdmin = false, onClose, onViewChange, onOpenSettings }, ref) => (
    <div
      ref={ref}
      className={`${styles.menu} ${isOpen ? styles.open : ""}`}
      id="context-menu"
      role="menu"
      aria-label="User menu"
    >
      <UserMenuPanel
        isAdmin={isAdmin}
        onClose={onClose}
        onViewChange={onViewChange}
        onOpenSettings={onOpenSettings}
      />
    </div>
  ),
);

ContextMenu.displayName = "ContextMenu";

export default ContextMenu;
