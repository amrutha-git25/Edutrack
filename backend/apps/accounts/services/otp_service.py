
import secrets

from django.conf import settings
from django.core.cache import cache
from django.core.mail import send_mail


OTP_EXPIRY_SECONDS = 60
OTP_MAX_ATTEMPTS = 5


def _otp_key(email):
    return f"edutrack:registration:otp:{email.strip().lower()}"


def _registration_key(email):
    return f"edutrack:registration:data:{email.strip().lower()}"


def generate_otp():
    """Generate a cryptographically secure six-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def store_registration_data(email, registration_data):
    """Temporarily store registration data until OTP verification."""
    email = email.strip().lower()

    # Never cache a plaintext copy of the password.
    safe_data = {
        key: value
        for key, value in registration_data.items()
        if key not in {"password", "confirm_password", "otp"}
    }

    cache.set(
        _registration_key(email),
        safe_data,
        timeout=OTP_EXPIRY_SECONDS,
    )


def get_registration_data(email):
    """Return pending registration data, if it has not expired."""
    return cache.get(_registration_key(email.strip().lower()))


def send_registration_otp(email):
    """
    Generate and email an OTP.
    Returns True if the email was accepted by Django's email backend.
    """
    email = email.strip().lower()
    otp = generate_otp()

    # Preserve the existing registration data's remaining cache lifetime
    # by refreshing it only when the caller explicitly stores it.
    cache.set(
        _otp_key(email),
        {"code": otp, "attempts": 0},
        timeout=OTP_EXPIRY_SECONDS,
    )

    try:
        sent_count = send_mail(
            subject="Your EduTrack verification code",
            message=(
                f"Your EduTrack verification code is: {otp}\n\n"
                f"This code expires in {OTP_EXPIRY_SECONDS} seconds.\n"
                "Do not share this code with anyone."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )

        if sent_count != 1:
            cache.delete(_otp_key(email))
            return False

        return True

    except Exception:
        cache.delete(_otp_key(email))
        raise


def verify_registration_otp(email, submitted_otp):
    """
    Validate an OTP.
    Returns (success, message).
    """
    email = email.strip().lower()
    submitted_otp = str(submitted_otp).strip()

    key = _otp_key(email)
    stored = cache.get(key)

    if not stored:
        return False, "OTP expired or not found. Please request a new OTP."

    if stored["attempts"] >= OTP_MAX_ATTEMPTS:
        cache.delete(key)
        return False, "Too many incorrect attempts. Please request a new OTP."

    if not (
        len(submitted_otp) == 6
        and submitted_otp.isdigit()
        and secrets.compare_digest(stored["code"], submitted_otp)
    ):
        stored["attempts"] += 1

        # Retain a short expiry after an incorrect attempt.
        cache.set(key, stored, timeout=OTP_EXPIRY_SECONDS)

        remaining = OTP_MAX_ATTEMPTS - stored["attempts"]
        return False, (
            f"Incorrect OTP. {remaining} attempt(s) remaining."
        )

    cache.delete(key)
    return True, "Email verified successfully."


def clear_registration_data(email):
    """Remove temporary registration information after completion."""
    email = email.strip().lower()
    cache.delete(_otp_key(email))
    cache.delete(_registration_key(email))
