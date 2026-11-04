
import React from "react";
import { useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiHome,
  FiAlertTriangle,
} from "react-icons/fi";
import "./NotFound.css";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="not-found-page">
      <div className="not-found-background">
        <div className="not-found-glow glow-one"></div>
        <div className="not-found-glow glow-two"></div>
      </div>

      <div className="not-found-content">
        <div className="not-found-icon">
          <FiAlertTriangle />
        </div>

        <h1 className="not-found-code">404</h1>

        <h2 className="not-found-title">
          Oops! Page Not Found
        </h2>

        <p className="not-found-description">
          The page you're looking for doesn't exist, has been moved,
          or the URL may be incorrect.
        </p>

        <div className="not-found-buttons">
          <button
            className="not-found-home-btn"
            onClick={() => navigate("/")}
          >
            <FiHome />
            Go to Home
          </button>

          <button
            className="not-found-back-btn"
            onClick={() => navigate(-1)}
          >
            <FiArrowLeft />
            Go Back
          </button>
        </div>

        <div className="not-found-footer">
          <span className="not-found-brand">EduTrack</span>
          <span className="not-found-footer-text">
            Empowering Learning Through Technology
          </span>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
