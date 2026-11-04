import React from "react";
import { LogOut, X } from "lucide-react";
import "./LogoutModal.css";

const LogoutModal = ({ isOpen, onCancel, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div className="logout-modal-overlay" onClick={onCancel}>
      <div
        className="logout-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-modal-title"
      >
        <button
          type="button"
          className="logout-modal-close"
          onClick={onCancel}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>

        <div className="logout-modal-icon">
          <LogOut size={26} />
        </div>

        <h2 id="logout-modal-title">Confirm Logout</h2>

        <p>Are you sure you want to logout?</p>
        <span className="logout-modal-subtitle">
          You will need to log in again to access your account.
        </span>

        <div className="logout-modal-actions">
          <button
            type="button"
            className="logout-cancel-btn"
            onClick={onCancel}
          >
            Cancel
          </button>

          <button
            type="button"
            className="logout-confirm-btn"
            onClick={onConfirm}
          >
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutModal;