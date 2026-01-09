"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./RenameDialog.module.css";

interface RenameDialogProps {
  isOpen: boolean;
  currentName: string;
  onClose: () => void;
  onSave: (newName: string) => Promise<void>;
  title?: string;
  maxLength?: number;
}

export default function RenameDialog({
  isOpen,
  currentName,
  onClose,
  onSave,
  title = "Rename",
  maxLength = 200,
}: RenameDialogProps) {
  const [newName, setNewName] = useState(currentName);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
      // Focus input after dialog opens
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [isOpen, currentName]);

  const handleSave = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName) {
      alert("Name cannot be empty");
      return;
    }
    if (trimmedName === currentName) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      await onSave(trimmedName);
      onClose();
    } catch (error) {
      console.error("Failed to rename:", error);
      alert("Failed to rename. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>{title}</h3>
        </div>
        <div className={styles.content}>
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={maxLength}
            disabled={isSaving}
            className={styles.input}
            placeholder="Enter new name"
          />
          <div className={styles.charCount}>
            {newName.length} / {maxLength}
          </div>
        </div>
        <div className={styles.footer}>
          <button
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={isSaving || !newName.trim()}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
