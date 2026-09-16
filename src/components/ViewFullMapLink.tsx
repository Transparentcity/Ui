"use client";

import "./ViewFullMapLink.css";

type Props = {
  onClick: () => void;
  saving?: boolean;
  disabled?: boolean;
};

export default function ViewFullMapLink({
  onClick,
  saving = false,
  disabled = false,
}: Props) {
  return (
    <div className="view-full-map-link-row">
      <button
        type="button"
        onClick={onClick}
        disabled={saving || disabled}
        className="view-full-map-link"
      >
        {saving ? "Opening…" : "View full map"}{" "}
        <i className="fas fa-external-link-alt" />
      </button>
    </div>
  );
}
