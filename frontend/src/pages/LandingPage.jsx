
import {
  FiBookOpen,
  FiLayers,
  FiTrendingUp,
  FiAward,
  FiBell,
  FiUser,
  FiArrowUpRight,
  FiPlay,
  FiCheck,
  FiUsers,
  FiMonitor,
  FiMenu,
  FiX,
  FiLinkedin,
  FiInstagram,
  FiBook,
  FiTarget,
  FiZap,
  FiBarChart2,
  FiShield,
  FiStar,
} from 'react-icons/fi'
import { FaGraduationCap } from 'react-icons/fa6'
import { FaXTwitter } from 'react-icons/fa6'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import './LandingPage.css'

const features = [
  {
    icon: FiBookOpen,
    title: 'Comprehensive Courses',
    text: 'Explore a wide range of courses designed to match your goals and help you build valuable skills.',
  },
  {
    icon: FiLayers,
    title: 'Interactive Learning',
    text: 'Learn through engaging lessons, quizzes, assignments, and interactive learning materials.',
  },
  {
    icon: FiTrendingUp,
    title: 'Track Your Progress',
    text: 'Monitor your achievements, understand your strengths, and stay motivated throughout your journey.',
  },
  {
    icon: FiAward,
    title: 'Earn Certificates',
    text: 'Showcase your achievements with certificates that celebrate your learning milestones.',
  },
]

const steps = [
  {
    number: '01',
    icon: FiUser,
    title: 'Create An Account',
    text: 'Sign up in seconds and personalize your learning experience.',
  },
  {
    number: '02',
    icon: FiBookOpen,
    title: 'Explore Courses',
    text: 'Discover courses and resources that match your interests.',
  },
  {
    number: '03',
    icon: FiTarget,
    title: 'Learn & Track',
    text: 'Learn at your own pace and track your progress as you go.',
  },
  {
    number: '04',
    icon: FiAward,
    title: 'Achieve & Grow',
    text: 'Complete your learning goals and celebrate your achievements.',
  },
]

const audiences = [
  {
    icon: FiBook,
    tag: 'FOR STUDENTS',
    title: 'Learn Your Way',
    text: 'Access courses, manage assignments, take quizzes, and track your learning progress in one place.',
  },
  {
    icon: FiUsers,
    tag: 'FOR MENTORS',
    title: 'Inspire the Next Wave',
    text: 'Share learning materials, manage assessments, guide students, and monitor their performance.',
  },
  {
    icon: FiMonitor,
    tag: 'FOR ADMINS',
    title: 'Campus Governance',
    text: 'Manage users, organize courses, oversee learning activities, and gain valuable insights.',
  },
]

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  const scrollTo = (id) => {
    closeMenu()
    document.getElementById(id)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  return (
    <div className="landing-page">
      {/* NAVIGATION */}
      <header className="landing-navbar">
        <a
          className="landing-brand"
          href="#home"
          onClick={closeMenu}
          aria-label="EduTrack home"
        >
          <span className="landing-brand-icon">
  <FaGraduationCap />
</span>
          <span>EduTrack<span className="brand-period">.</span></span>
        </a>

<nav
          className={`landing-nav-links ${menuOpen ? 'menu-open' : ''}`}
          aria-label="Main navigation"
        >
          <a href="#courses" onClick={closeMenu}>Courses</a>
          <a href="#features" onClick={closeMenu}>Mentors</a>
          <a href="#how-it-works" onClick={closeMenu}>Dashboard</a>
          <a href="#designed-for-everyone" onClick={closeMenu}>Resources</a>

          <div className="mobile-nav-actions">
            <Link to="/login" className="landing-signin" onClick={closeMenu}>
              Sign In
            </Link>
            <Link to="/register" className="landing-get-started" onClick={closeMenu}>
              Get Started <FiArrowUpRight />
            </Link>
          </div>
        </nav>

        <div className="landing-nav-actions">
          <Link to="/login" className="landing-signin">
            Sign In
          </Link>

          <button
            className="landing-icon-button"
            aria-label="View features"
            onClick={() => scrollTo('features')}
          >
            <FiBell />
          </button>

          <Link to="/login" className="landing-avatar" aria-label="Sign in">
            <FiUser />
          </Link>
        </div>

        <button
          className="landing-menu-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <FiX /> : <FiMenu />}
        </button>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="landing-hero landing-container" id="home">
          <div className="landing-hero-copy">
            <div className="landing-eyebrow">
              <span className="eyebrow-dot" />
              A SMARTER WAY TO LEARN
            </div>

            <h1>
              Your Learning
              <br />
              <span>Journey,</span>
              <br />
              All in One Place.
            </h1>

            <p className="landing-hero-description">
              EduTrack is an intelligent platform that brings courses,
              learning materials, assessments, and progress tracking together
              to deliver a smooth, personalized learning experience.
            </p>

            <div className="landing-hero-buttons">
              <Link to="/register" className="landing-button landing-button-primary">
                Get Started <FiArrowUpRight />
              </Link>

              <button
                className="landing-button landing-button-secondary"
                onClick={() => scrollTo('how-it-works')}
              >
                <FiPlay className="small-play-icon" />
                Watch Demo
              </button>
            </div>

            <div className="landing-stats">
              <div>
                <strong>10K+</strong>
                <span>Active Learners</span>
              </div>
              <div>
                <strong>500+</strong>
                <span>Expert Mentors</span>
              </div>
              <div>
                <strong>200+</strong>
                <span>Courses Available</span>
              </div>
              <div>
                <strong>95%</strong>
                <span>Success Rate</span>
              </div>
            </div>
          </div>

          <div className="landing-hero-visual">
            <div className="landing-hero-glow" />

            <div className="landing-hero-image-frame">
              <img
                src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=85"
                alt="Student studying at a desk with books and a laptop"
              />

              <div className="landing-image-caption">
                <span className="caption-icon">
                  <FiZap />
                </span>
                <span>
                  <strong>Your learning space</strong>
                  <small>Everything in one place</small>
                </span>
              </div>
            </div>

            <div className="landing-floating-card landing-floating-top">
              <span className="floating-icon purple-icon">
                <FiBookOpen />
              </span>
              <span>
                <strong>New Courses</strong>
                <small>Explore what's new</small>
              </span>
            </div>

            <div className="landing-floating-card landing-floating-right">
              <span className="floating-icon pink-icon">
                <FiAward />
              </span>
              <span>
                <strong>Certificate earned!</strong>
                <small>Keep up the great work</small>
              </span>
            </div>

            <div className="landing-floating-card landing-floating-bottom">
              <span className="floating-icon blue-icon">
                <FiTrendingUp />
              </span>
              <span>
                <strong>You're doing great</strong>
                <small>Your progress is growing</small>
              </span>
            </div>

            <span className="landing-decorative-orb orb-one">
              <FiZap />
            </span>
            <span className="landing-decorative-orb orb-two">
              <FiStar />
            </span>
          </div>
        </section>

        {/* FEATURES */}
        <section className="landing-section" id="features">
          <div className="landing-container">
            <div className="landing-section-heading">
              <span className="landing-section-kicker">THE EDUTRACK ADVANTAGE</span>
              <h2>
                Why Choose <span>EduTrack?</span>
              </h2>
              <p>
                Everything you need to learn, grow, and achieve your goals
                in one intelligent learning platform.
              </p>
            </div>

            <div className="landing-feature-grid">
              {features.map((feature, index) => {
                const Icon = feature.icon

                return (
                  <article className="landing-feature-card" key={feature.title}>
                    <div className={`landing-feature-icon feature-icon-${index + 1}`}>
                      <Icon />
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.text}</p>
                    <button
                      className="landing-text-link"
                      onClick={() => scrollTo('get-started')}
                    >
                      Explore more <FiArrowUpRight />
                    </button>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="landing-section landing-steps-section" id="how-it-works">
          <div className="landing-container">
            <div className="landing-section-heading">
              <span className="landing-section-kicker">YOUR JOURNEY STARTS HERE</span>
              <h2>
                How It <span>Works?</span>
              </h2>
              <p>
                Start learning, build new skills, and reach your goals
                with a simple four-step journey.
              </p>
            </div>

            <div className="landing-steps-grid">
              {steps.map((step, index) => {
                const Icon = step.icon

                return (
                  <article className="landing-step-card" key={step.number}>
                    <div className="landing-step-top">
                      <span className="landing-step-number">{step.number}</span>
                      {index < steps.length - 1 && (
                        <span className="landing-step-connector" />
                      )}
                    </div>

                    <div className="landing-step-icon">
                      <Icon />
                    </div>

                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        {/* PLATFORM SHOWCASE */}
        <section className="landing-section" id="courses">
          <div className="landing-container">
            <div className="landing-showcase-card">
              <div className="landing-showcase-image">
                <img
                  src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1200&q=85"
                  alt="Students learning and collaborating on a university campus"
                />

                <span className="landing-video-label">EDUTRACK CAMPUS</span>

                <button
                  className="landing-video-play"
                  aria-label="Explore the EduTrack learning experience"
                  onClick={() => scrollTo('designed-for-everyone')}
                >
                  <FiPlay />
                </button>

                <div className="landing-video-caption">
                  <FiBookOpen />
                  Learning & Growth Starts Here
                </div>
              </div>

              <div className="landing-showcase-copy">
                <span className="landing-pill-label">DISCOVER EDUTRACK</span>
                <h2>
                  Watch EduTrack in <span>Action</span>
                </h2>

                <p>
                  See how EduTrack makes education more connected,
                  organized, and engaging. From course discovery to
                  celebrating achievements, your learning journey
                  stays in one place.
                </p>

                <ul className="landing-benefit-list">
                  <li><span><FiCheck /></span> Personalized learning experience</li>
                  <li><span><FiCheck /></span> Easy access to materials and assessments</li>
                  <li><span><FiCheck /></span> Real-time progress at a glance</li>
                </ul>

                <button
                  className="landing-button landing-button-secondary"
                  onClick={() => scrollTo('get-started')}
                >
                  <FiPlay className="small-play-icon" />
                  Explore Platform
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* AUDIENCE */}
        <section
          className="landing-section landing-audience-section"
          id="designed-for-everyone"
        >
          <div className="landing-container">
            <div className="landing-section-heading">
              <span className="landing-section-kicker">BUILT FOR YOUR SUCCESS</span>
              <h2>
                Designed for <span>Everyone</span>
              </h2>
              <p>
                A connected learning experience for students, mentors,
                and administrators.
              </p>
            </div>

            <div className="landing-audience-grid">
              {audiences.map((item) => {
                const Icon = item.icon

                return (
                  <article className="landing-audience-card" key={item.title}>
                    <div className="landing-audience-icon">
                      <Icon />
                    </div>
                    <span className="landing-audience-tag">{item.tag}</span>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                    <button
                      className="landing-text-link"
                      onClick={() => scrollTo('get-started')}
                    >
                      Learn more <FiArrowUpRight />
                    </button>
                  </article>
                )
              })}
            </div>

            <article className="landing-testimonial-card">
              <div className="landing-testimonial-avatar">
                <FiUser />
              </div>

              <div className="landing-testimonial-content">
                <div className="landing-testimonial-stars" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }, (_, index) => (
                    <FiStar key={index} />
                  ))}
                </div>

                <blockquote>
                  “EduTrack has changed the way I manage my learning.
                  Everything from courses to assignments is organized
                  in one place, making it easier to stay focused and
                  track my progress.”
                </blockquote>

                <div className="landing-testimonial-author">
                  <strong>Emily Sharma</strong>
                  <span>Student & EduTrack Learner</span>
                </div>
              </div>

              <FiBookOpen className="landing-testimonial-decoration" />
            </article>
          </div>
        </section>

        {/* CALL TO ACTION */}
        <section className="landing-cta landing-container" id="get-started">
          <div className="landing-cta-decoration landing-cta-decoration-one" />
          <div className="landing-cta-decoration landing-cta-decoration-two" />

          <span className="landing-cta-kicker">
            YOUR NEXT CHAPTER STARTS NOW
          </span>

          <h2>
            Ready to Begin Your Educational
            <br />
            Journey?
          </h2>

          <p>
            Join a growing learning community and take the next step
            toward your goals with EduTrack.
          </p>

          <div className="landing-cta-buttons">
            <Link to="/register" className="landing-button landing-cta-light">
              Create Free Account <FiArrowUpRight />
            </Link>

            <button
              className="landing-button landing-cta-outline"
              onClick={() => scrollTo('courses')}
            >
              Explore Courses
            </button>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-grid">
            <div className="landing-footer-brand-column">
              <a className="landing-brand" href="#home">
               <span className="landing-brand-icon">
  <FaGraduationCap />
</span>
                <span>EduTrack<span className="brand-period">.</span></span>
              </a>

              <p>
                Empowering learners with a smarter, simpler, and more
                connected educational experience.
              </p>

              <div className="landing-social-links">
                <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer" aria-label="LinkedIn">
                  <FiLinkedin />
                </a>
                <a href="https://x.com/" target="_blank" rel="noreferrer" aria-label="X">
                  <FaXTwitter />
                </a>
                <a href="https://www.instagram.com/" target="_blank" rel="noreferrer" aria-label="Instagram">
                  <FiInstagram />
                </a>
              </div>
            </div>

            <div className="landing-footer-column">
              <h4>Learning</h4>
              <a href="#courses">Explore Courses</a>
              <a href="#features">Learning Materials</a>
              <a href="#how-it-works">Assessments</a>
              <a href="#features">Certificates</a>
            </div>

            <div className="landing-footer-column">
              <h4>Platform</h4>
              <a href="#designed-for-everyone">For Students</a>
              <a href="#designed-for-everyone">For Mentors</a>
              <a href="#designed-for-everyone">For Admins</a>
              <a href="#features">Features</a>
            </div>

            <div className="landing-footer-column">
              <h4>Account</h4>
              <Link to="/login">Sign In</Link>
              <Link to="/register">Create Account</Link>
              <a href="#get-started">Get Started</a>
              <a href="mailto:support@edutrack.example">Help & Support</a>
            </div>
          </div>

          <div className="landing-footer-bottom">
            <span>© 2026 EduTrack. All rights reserved.</span>

            <div>
              <a href="#home">Privacy Policy</a>
              <a href="#home">Terms of Service</a>
              <a href="mailto:support@edutrack.example">Contact Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage;
