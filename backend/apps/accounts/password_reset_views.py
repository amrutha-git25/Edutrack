# backend/apps/accounts/password_reset_views.py

import logging
import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode

from rest_framework import status
from rest_framework.decorators import (
    api_view,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle


logger = logging.getLogger(__name__)
User = get_user_model()


# ---------------------------------------------------------
# THROTTLING
# ---------------------------------------------------------

class PasswordResetRequestThrottle(AnonRateThrottle):
    scope = "password_reset_request"


class PasswordResetConfirmThrottle(AnonRateThrottle):
    scope = "password_reset_confirm"


# ---------------------------------------------------------
# STANDARD API RESPONSE
# ---------------------------------------------------------

def api_response(success, message, http_status=status.HTTP_200_OK):
    return Response(
        {
            "success": success,
            "message": message,
        },
        status=http_status,
    )


# ---------------------------------------------------------
# PASSWORD RESET REQUEST
# POST /api/auth/password-reset/
# Body: {"email": "user@example.com"}
# ---------------------------------------------------------

@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRequestThrottle])
def password_reset_request(request):

    email = str(request.data.get("email", "")).strip().lower()

    # Validate email format.
    if not email or not re.match(
        r"^[^\s@]+@[^\s@]+\.[^\s@]+$",
        email,
    ):
        return api_response(
            False,
            "Enter a valid email address.",
            status.HTTP_400_BAD_REQUEST,
        )

    generic_message = (
        "If an account exists for this email, "
        "password-reset instructions will be sent to that address."
    )

    try:
        users = User.objects.filter(
            email__iexact=email,
            is_active=True,
        )

        matching_count = users.count()

        print(
            f"[PASSWORD RESET] Active accounts matching email: "
            f"{matching_count}"
        )

        logger.info(
            "Password-reset request received. "
            "Matching active accounts: %s",
            matching_count,
        )

        if matching_count == 0:
            print(
                "[PASSWORD RESET] No active account matched "
                "the submitted email address."
            )

        for user in users:

            # Do not issue reset links to unusable-password accounts.
            if not user.has_usable_password():
                print(
                    "[PASSWORD RESET] Skipped account because "
                    "it has no usable password."
                )

                logger.warning(
                    "Password reset skipped for an account "
                    "without a usable password."
                )
                continue

            # Generate a secure, time-limited reset token.
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)

            frontend_url = getattr(
                settings,
                "FRONTEND_URL",
                "http://localhost:5173",
            ).rstrip("/")

            reset_url = (
                f"{frontend_url}/reset-password"
                f"?uid={uid}&token={token}"
            )

            subject = "Reset your EduTrack password"

            # IMPORTANT:
            # Adjacent strings are intentionally written without commas.
            # This creates one string, not a tuple.
            message = (
                f"Hello {user.get_full_name() or 'EduTrack user'},\n\n"
                "We received a request to reset your EduTrack password.\n\n"
                "Use the link below to choose a new password:\n"
                f"{reset_url}\n\n"
                "If you did not request this, you can safely ignore "
                "this email.\n\n"
                "EduTrack Support"
            )

            try:
                print(
                    "[PASSWORD RESET] Attempting to send email "
                    "through Django's configured email backend."
                )

                sent_count = send_mail(
                    subject=subject,
                    message=message,
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=False,
                )

                if sent_count == 1:
                    print(
                        "[PASSWORD RESET] Email backend accepted "
                        "the message successfully."
                    )

                    logger.info(
                        "Password-reset email accepted by email backend."
                    )

                else:
                    print(
                        "[PASSWORD RESET] Email backend returned "
                        f"sent_count={sent_count}. No email was confirmed."
                    )

                    logger.error(
                        "Password-reset email was not accepted. "
                        "send_mail returned %s.",
                        sent_count,
                    )

            except Exception as error:
                # This prints the actual error in the Django terminal.
                print(
                    "[PASSWORD RESET] EMAIL SENDING FAILED: "
                    f"{type(error).__name__}: {error}"
                )

                logger.exception(
                    "Unable to send password-reset email."
                )

    except Exception as error:
        print(
            "[PASSWORD RESET] REQUEST PROCESSING FAILED: "
            f"{type(error).__name__}: {error}"
        )

        logger.exception(
            "Unexpected error while processing password-reset request."
        )

    # Keep the response generic to protect account privacy.
    return api_response(
        True,
        generic_message,
        status.HTTP_200_OK,
    )


# ---------------------------------------------------------
# PASSWORD RESET CONFIRMATION
# POST /api/auth/password-reset/confirm/
#
# Body:
# {
#     "uid": "...",
#     "token": "...",
#     "new_password": "...",
#     "confirm_password": "..."
# }
# ---------------------------------------------------------

@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetConfirmThrottle])
def password_reset_confirm(request):

    uid = str(request.data.get("uid", "")).strip()
    token = str(request.data.get("token", "")).strip()

    new_password = request.data.get("new_password", "")
    confirm_password = request.data.get("confirm_password", "")

    # Validate reset-link parameters.
    if not uid or not token:
        return api_response(
            False,
            "The password-reset link is invalid or incomplete.",
            status.HTTP_400_BAD_REQUEST,
        )

    # Validate password field types.
    if not isinstance(new_password, str) or not isinstance(
        confirm_password, str
    ):
        return api_response(
            False,
            "Enter a valid new password.",
            status.HTTP_400_BAD_REQUEST,
        )

    # Ensure both password fields are supplied.
    if not new_password or not confirm_password:
        return api_response(
            False,
            "Enter and confirm your new password.",
            status.HTTP_400_BAD_REQUEST,
        )

    # Ensure passwords match.
    if new_password != confirm_password:
        return api_response(
            False,
            "The new password and confirmation do not match.",
            status.HTTP_400_BAD_REQUEST,
        )

    # EduTrack password policy:
    # Minimum 8 characters, uppercase, lowercase, number,
    # and special character.
    strong_password = (
        r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)"
        r"(?=.*[^A-Za-z0-9]).{8,}$"
    )

    if not re.match(strong_password, new_password):
        return api_response(
            False,
            (
                "Password must contain at least 8 characters, "
                "including uppercase and lowercase letters, "
                "a number, and a special character."
            ),
            status.HTTP_400_BAD_REQUEST,
        )

    # Decode the user ID from the reset link.
    try:
        user_id = force_str(urlsafe_base64_decode(uid))

        user = User.objects.get(
            pk=user_id,
            is_active=True,
        )

    except (
        TypeError,
        ValueError,
        OverflowError,
        UnicodeDecodeError,
        User.DoesNotExist,
    ):
        return api_response(
            False,
            "The password-reset link is invalid or has expired.",
            status.HTTP_400_BAD_REQUEST,
        )

    # Validate the secure, time-limited token.
    if not default_token_generator.check_token(user, token):
        return api_response(
            False,
            (
                "The password-reset link is invalid or has expired. "
                "Request a new one."
            ),
            status.HTTP_400_BAD_REQUEST,
        )

    # Run Django's configured password validators.
    try:
        validate_password(new_password, user=user)

    except ValidationError as error:
        return api_response(
            False,
            " ".join(error.messages),
            status.HTTP_400_BAD_REQUEST,
        )

    # Hash and save the new password.
    user.set_password(new_password)
    user.save(update_fields=["password"])

    logger.info("Password reset completed successfully.")

    return api_response(
        True,
        "Your password has been reset successfully. You can now log in.",
        status.HTTP_200_OK,
    )