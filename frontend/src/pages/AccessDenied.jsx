
import React from "react";
import { useNavigate } from "react-router-dom";
import {
  FiShield,
  FiHome,
  FiArrowLeft,
  FiLock,
} from "react-icons/fi";
import "./AccessDenied.css";

const AccessDenied = () => {
  const navigate = useNavigate();

  return (
    <div className="access-denied-page">
      <div className="access-denied-background">
        <div className="access-denied-glow access-glow-one"></div>
        <div className="access-denied-glow access-glow-two"></div>
      </div>

      <div className="access-denied-content">
        <div className="access-denied-icon">
          <FiShield />
          <span className="access-denied-lock">
            <FiLock />
          </span>
        </div>

        <h1 className="access-denied-code">403</h1>

        <h2 className="access-denied-title">
          Access Denied
        </h2>

        <p className="access-denied-description">
          Sorry! You don't have permission to access this page.
          Your account may not have the required role or privileges.
        </p>

        <div className="access-denied-buttons">
          <button
            className="access-denied-home-btn"
            onClick={() => navigate("/")}
          >
            <FiHome />
            Go to Home
          </button>

          <button
            className="access-denied-back-btn"
            onClick={() => navigate(-1)}
          >
            <FiArrowLeft />
            Go Back
          </button>
        </div>

        <div className="access-denied-footer">
          <span className="access-denied-brand">EduTrack</span>
          <span className="access-denied-footer-text">
            Empowering Learning Through Technology
          </span>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;
