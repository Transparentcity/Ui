"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ModelGroupInfo } from "@/lib/apiClient";
import { pickDefaultModelKey } from "@/lib/modelDefaults";
import styles from "./RegenerateModal.module.css";

interface RegenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (modelKey: string) => Promise<void>;
  availableModels: ModelGroupInfo[];
  defaultModelKey?: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
}

export default function RegenerateModal({
  isOpen,
  onClose,
  onConfirm,
  availableModels,
  defaultModelKey,
  title = "Regenerate Research",
  description = "This will re-run the research with the selected model. The original research will be replaced.",
  confirmLabel = "Regenerate",
}: RegenerateModalProps) {
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Ensure we only render portal on client
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Set initial model from prop or pick default
      if (defaultModelKey) {
        setSelectedModel(defaultModelKey);
      } else {
        const defaultKey = pickDefaultModelKey(availableModels);
        if (defaultKey) setSelectedModel(defaultKey);
      }
    }
  }, [isOpen, defaultModelKey, availableModels]);

  const handleConfirm = async () => {
    if (!selectedModel) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(selectedModel);
      onClose();
    } catch (error) {
      console.error("Regenerate failed:", error);
      // Don't close on error - let parent handle alert
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className={styles.overlay} onClick={onClose} onKeyDown={handleKeyDown}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>{title}</h3>
        </div>
        <div className={styles.content}>
          <p className={styles.description}>{description}</p>
          
          <div className={styles.field}>
            <label htmlFor="model-select" className={styles.label}>
              Select Model
            </label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isSubmitting}
              className={styles.select}
            >
              <option value="">-- Select a model --</option>
              {availableModels.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.models.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.footer}>
          <button
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={isSubmitting || !selectedModel}
          >
            {isSubmitting ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  // Use portal to render at document body level, ensuring proper centering and z-index
  return createPortal(modalContent, document.body);
}
