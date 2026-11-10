
import secrets
import logging
from drf_spectacular.utils import extend_schema
from django.conf import settings
from django.http import HttpResponse
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.mail import send_mail
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError

from django.core.files.storage import default_storage

from .models import SystemSettings, AdminProfile
from apps.users.users.models import Student, StudentSettings
from .serializers import (
    ProfileSerializer,
    ChangePasswordSerializer,
)


from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework import serializers as drf_serializers

from .models import SystemSettings
from .serializers import SystemSettingsSerializer
from django.contrib.auth import authenticate

from rest_framework_simplejwt.tokens import RefreshToken

import os

from PIL import Image



from rest_framework.decorators import (
    
    parser_classes,
)
from rest_framework.parsers import MultiPartParser, FormParser


from .serializers import (
    StudentProfileSerializer,
    StudentChangePasswordSerializer,
)



from .serializers import LoginSerializer

from .serializers import (
    SendOTPSerializer,
    VerifyOTPSerializer,
    ResendOTPSerializer,
)


logger = logging.getLogger(__name__)

User = get_user_model()

OTP_EXPIRY_SECONDS = 60
OTP_MAX_ATTEMPTS = 5


def otp_cache_key(email):
    return f"edutrack_otp_{email.strip().lower()}"


def pending_registration_key(email):
    return f"edutrack_registration_{email.strip().lower()}"

import os
import requests
from django.conf import settings


def send_registration_email(email, otp):
    api_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv(
        "BREVO_SENDER_EMAIL",
        settings.DEFAULT_FROM_EMAIL
    )

    if not api_key:
        raise Exception("BREVO_API_KEY is not configured in Render.")

    subject = "Your EduTrack verification code"

    message = (
        f"Your EduTrack email verification code is {otp}.\n"
        f"It expires in {OTP_EXPIRY_SECONDS} seconds.\n"
        "If you did not request this code, ignore this email."
    )

    payload = {
        "sender": {
            "name": "EduTrack",
            "email": sender_email
        },
        "to": [
            {
                "email": email
            }
        ],
        "subject": subject,
        "textContent": message
    }

    headers = {
        "api-key": api_key,
        "accept": "application/json",
        "content-type": "application/json"
    }

    try:
        response = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers=headers,
            json=payload,
            timeout=15
        )

        if response.status_code not in (200, 201):
            raise Exception(
                f"Brevo API error {response.status_code}: {response.text}"
            )

    except requests.RequestException as e:
        raise Exception(f"Failed to send OTP email: {str(e)}")

@api_view(["POST"])
@permission_classes([AllowAny])
def send_registration_otp(request):
    serializer = SendOTPSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(
            {
                "success": False,
                "message": "Validation failed.",
                "errors": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = serializer.validated_data
    email = data["email"].strip().lower()

    # Do not allow a second account with the same email.
    if User.objects.filter(email__iexact=email).exists():
        return Response(
            {
                "success": False,
                "message": "An account with this email already exists.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Store registration data temporarily until OTP verification.
    registration_data = {
        key: value
        for key, value in data.items()
        if key not in {"confirm_password", "otp"}
    }

    otp = f"{secrets.randbelow(1_000_000):06d}"

    cache.set(
        pending_registration_key(email),
        registration_data,
        timeout=OTP_EXPIRY_SECONDS,
    )
    cache.set(
        otp_cache_key(email),
        {"code": otp, "attempts": 0},
        timeout=OTP_EXPIRY_SECONDS,
    )

    try:
        send_registration_email(email, otp)
    except Exception:
        logger.exception("EduTrack registration OTP email failed for %s", email)
        cache.delete(pending_registration_key(email))
        cache.delete(otp_cache_key(email))
        return Response(
            {
                "success": False,
                "message": "Unable to send the verification email. Please try again.",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response(
        {
            "success": True,
            "message": "Verification code sent to your email.",
            "data": {"email": email, "expires_in": OTP_EXPIRY_SECONDS},
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_registration_otp(request):
    serializer = VerifyOTPSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(
            {
                "success": False,
                "message": "Validation failed.",
                "errors": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    email = serializer.validated_data["email"].strip().lower()
    submitted_otp = str(serializer.validated_data["otp"]).strip()

    stored_otp = cache.get(otp_cache_key(email))
    registration_data = cache.get(pending_registration_key(email))

    if not stored_otp or not registration_data:
        return Response(
            {
                "success": False,
                "message": "Verification code expired or registration was not started. Request a new code.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if stored_otp["attempts"] >= OTP_MAX_ATTEMPTS:
        cache.delete(otp_cache_key(email))
        cache.delete(pending_registration_key(email))
        return Response(
            {
                "success": False,
                "message": "Too many incorrect attempts. Request a new code.",
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    if not secrets.compare_digest(stored_otp["code"], submitted_otp):
        stored_otp["attempts"] += 1
        remaining_ttl = cache.ttl(otp_cache_key(email))

        # Django's default cache backends do not all support ttl().
        # Reset with a short lifetime if ttl() is unavailable.
        timeout = (
            remaining_ttl
            if isinstance(remaining_ttl, int) and remaining_ttl > 0
            else OTP_EXPIRY_SECONDS
        )
        cache.set(otp_cache_key(email), stored_otp, timeout=timeout)

        return Response(
            {
                "success": False,
                "message": "Incorrect verification code.",
                "attempts_remaining": OTP_MAX_ATTEMPTS - stored_otp["attempts"],
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email__iexact=email).exists():
        cache.delete(otp_cache_key(email))
        cache.delete(pending_registration_key(email))
        return Response(
            {
                "success": False,
                "message": "An account with this email already exists.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    role = str(registration_data.get("role", "")).upper()
    if role not in {"STUDENT", "MENTOR"}:
        return Response(
            {
                "success": False,
                "message": "Public registration is allowed only for Student and Mentor accounts.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    password = registration_data.get("password")
    first_name = registration_data.get("first_name", "")
    last_name = registration_data.get("last_name", "")

    if not password:
        return Response(
            {
                "success": False,
                "message": "Registration data is incomplete. Please register again.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Create the account and assign its role group so login role validation
    # recognizes the account as STUDENT or MENTOR.
    from django.contrib.auth.models import Group
    from django.db import transaction

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=email,
                email=email,
                password=password,
                first_name=first_name,
                last_name=last_name,
            )

            role_group, _ = Group.objects.get_or_create(name=role)
            user.groups.add(role_group)

            # Create a linked Student profile for every new student account.
            if role == "STUDENT":
                Student.objects.create(
                    user=user,
                    pin_number=f"REG-{user.pk:06d}",
                    percentage=0,
                    branch="Not assigned",
                    section="Not assigned",
                    phone_number=registration_data.get("phone_number", ""),
                )

                # Create default settings if the model supports this relation.
                StudentSettings.objects.get_or_create(user=user)

    except Exception:
        logger.exception("EduTrack registration account/profile creation failed for %s", email)
        return Response(
            {
                "success": False,
                "message": "Unable to create the account. Please try again.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    cache.delete(otp_cache_key(email))
    cache.delete(pending_registration_key(email))

    return Response(
        {
            "success": True,
            "message": "Email verified and account created successfully.",
            "data": {
                "id": user.pk,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": role,
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def resend_registration_otp(request):
    serializer = ResendOTPSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(
            {
                "success": False,
                "message": "Validation failed.",
                "errors": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    email = serializer.validated_data["email"].strip().lower()
    registration_data = cache.get(pending_registration_key(email))

    if not registration_data:
        return Response(
            {
                "success": False,
                "message": "Registration has expired. Please start registration again.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email__iexact=email).exists():
        return Response(
            {
                "success": False,
                "message": "An account with this email already exists.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    otp = f"{secrets.randbelow(1_000_000):06d}"

    cache.set(
        otp_cache_key(email),
        {"code": otp, "attempts": 0},
        timeout=OTP_EXPIRY_SECONDS,
    )
    cache.set(
        pending_registration_key(email),
        registration_data,
        timeout=OTP_EXPIRY_SECONDS,
    )

    try:
        send_registration_email(email, otp)
    except Exception:
        logger.exception("EduTrack registration OTP resend failed for %s", email)
        cache.delete(otp_cache_key(email))
        return Response(
            {
                "success": False,
                "message": "Unable to resend the verification email. Please try again.",
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    return Response(
        {
            "success": True,
            "message": "A new verification code has been sent.",
            "data": {"email": email, "expires_in": OTP_EXPIRY_SECONDS},
        },
        status=status.HTTP_200_OK,
    )


# Keep these existing view names if your urls.py references them.
# These placeholders must be replaced with your actual implementations.


@api_view(["GET"])
@permission_classes([AllowAny])
def api_status(request):
    return Response({
        "success": True,
        "message": "EduTrack API running"
    })



@extend_schema(
    summary="Login to EduTrack",
    request=LoginSerializer,
    responses={200: dict, 400: dict, 401: dict},
)
@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data["email"]
    password = serializer.validated_data["password"]
    requested_role = serializer.validated_data["role"].upper()

    User = get_user_model()

    user = User.objects.filter(email__iexact=email).first()

    # Reject invalid credentials and inactive accounts.
    if (
        user is None
        or not user.is_active
        or not user.check_password(password)
    ):
        return Response(
            {
                "success": False,
                "message": "Invalid email or password.",
            },
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # ADMIN access is exclusively for Django superusers.
    if requested_role == "ADMIN":
        if not user.is_superuser:
            return Response(
                {
                    "success": False,
                    "message": "Only a superuser can access the Admin panel.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

    # Mentor and Student access must match the user's Django group.
    elif not user.groups.filter(
        name__iexact=requested_role
    ).exists():
        return Response(
            {
                "success": False,
                "message": "Your account does not have the selected role.",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    refresh = RefreshToken.for_user(user)

    role = (
        "ADMIN"
        if user.is_superuser
        else requested_role
    )

    return Response(
        {
            "success": True,
            "message": "Login successful.",
            "data": {
                "user": {
                    "id": user.pk,
                    "username": user.get_username(),
                    "email": user.email,
                    "first_name": user.first_name,
                    "last_name": user.last_name,
                    "role": role,
                },
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
        },
        status=status.HTTP_200_OK,
    )


@extend_schema(
    summary="Refresh access token",
    request=dict,
    responses={200: dict, 400: dict},
)
@api_view(["POST"])
@permission_classes([AllowAny])
def refresh_token_view(request):
    serializer = TokenRefreshSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    return Response(
        {
            "success": True,
            "data": serializer.validated_data,
        },
        status=status.HTTP_200_OK,
    )

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    Logout the authenticated user by blacklisting their refresh token.
    """
    refresh_token = request.data.get("refresh")

    if not refresh_token:
        return Response(
            {
                "success": False,
                "message": "Refresh token is required.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        token = RefreshToken(refresh_token)

        # Ensure the refresh token belongs to the logged-in user.
        token_user_id = token.get("user_id")

        if str(token_user_id) != str(request.user.pk):
            return Response(
                {
                    "success": False,
                    "message": "Invalid refresh token for this user.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Blacklist the refresh token.
        token.blacklist()

        return Response(
            {
                "success": True,
                "message": "Logout successful.",
            },
            status=status.HTTP_200_OK,
        )

    except TokenError:
        return Response(
            {
                "success": False,
                "message": "Invalid or expired refresh token.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )



@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_profile(request):
    """Return the authenticated administrator's profile."""
    if not request.user.is_superuser:
        return Response(
            {"success": False, "message": "Admin access required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = ProfileSerializer(
        request.user,
        context={"request": request},
    )
    return Response(
        {
            "success": True,
            "message": "Profile retrieved successfully.",
            "data": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["PATCH", "PUT"])
@permission_classes([IsAuthenticated])
def update_profile(request):
    """Update the administrator's name, email and phone number."""
    if not request.user.is_superuser:
        return Response(
            {"success": False, "message": "Admin access required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = ProfileSerializer(
        request.user,
        data=request.data,
        partial=(request.method == "PATCH"),
        context={"request": request},
    )

    if not serializer.is_valid():
        return Response(
            {
                "success": False,
                "message": "Profile validation failed.",
                "errors": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer.save()

    return Response(
        {
            "success": True,
            "message": "Profile updated successfully.",
            "data": ProfileSerializer(
                request.user,
                context={"request": request},
            ).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    """Change the administrator's password securely."""
    if not request.user.is_superuser:
        return Response(
            {"success": False, "message": "Admin access required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = ChangePasswordSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(
            {
                "success": False,
                "message": "Password validation failed.",
                "errors": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not request.user.check_password(
        serializer.validated_data["current_password"]
    ):
        return Response(
            {
                "success": False,
                "message": "Current password is incorrect.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    request.user.set_password(
        serializer.validated_data["new_password"]
    )
    request.user.save(update_fields=["password"])

    return Response(
        {
            "success": True,
            "message": "Password changed successfully.",
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def upload_profile_picture(request):
    """Validate and store the administrator profile image bytes in Neon PostgreSQL."""
    if not request.user.is_superuser:
        return Response({"success": False, "message": "Admin access required."},
                        status=status.HTTP_403_FORBIDDEN)

    image = request.FILES.get("profile_picture")
    if not image:
        return Response({"success": False, "message": "Select a profile picture to upload."},
                        status=status.HTTP_400_BAD_REQUEST)

    allowed_types = {"image/jpeg", "image/png"}
    if image.content_type not in allowed_types:
        return Response({"success": False, "message": "Only JPG and PNG images are allowed."},
                        status=status.HTTP_400_BAD_REQUEST)
    if image.size > 5 * 1024 * 1024:
        return Response({"success": False, "message": "Image size must not exceed 5 MB."},
                        status=status.HTTP_400_BAD_REQUEST)

    try:
        from PIL import Image
        image.seek(0)
        with Image.open(image) as uploaded_image:
            if uploaded_image.format not in {"JPEG", "PNG"}:
                raise ValueError("Unsupported image format")
            uploaded_image.verify()
        image.seek(0)
        image_bytes = image.read()
    except Exception:
        return Response({"success": False, "message": "The uploaded file is not a valid JPG or PNG image."},
                        status=status.HTTP_400_BAD_REQUEST)

    profile, _ = AdminProfile.objects.get_or_create(user=request.user)
    profile.profile_picture_data = image_bytes
    profile.profile_picture_content_type = image.content_type
    profile.profile_picture_filename = image.name[:255]
    profile.save(update_fields=["profile_picture_data", "profile_picture_content_type",
                               "profile_picture_filename", "updated_at"])

    return Response({"success": True, "message": "Profile picture updated successfully.",
                     "data": ProfileSerializer(request.user, context={"request": request}).data},
                    status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_profile_picture_content(request):
    """Serve image bytes stored in PostgreSQL."""
    if not request.user.is_superuser:
        return Response({"success": False, "message": "Admin access required."},
                        status=status.HTTP_403_FORBIDDEN)
    profile = AdminProfile.objects.filter(user=request.user).first()
    if not profile or not profile.profile_picture_data:
        return Response({"success": False, "message": "Profile picture not found."},
                        status=status.HTTP_404_NOT_FOUND)
    response = HttpResponse(profile.profile_picture_data,
                            content_type=profile.profile_picture_content_type or "image/png")
    response["Cache-Control"] = "private, max-age=300"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_profile_picture(request):
    """Remove the administrator's profile picture."""
    if not request.user.is_superuser:
        return Response(
            {"success": False, "message": "Admin access required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    profile, _ = AdminProfile.objects.get_or_create(user=request.user)

    if profile.profile_picture_data:
        profile.profile_picture_data = None
        profile.profile_picture_content_type = ""
        profile.profile_picture_filename = ""
        profile.save(update_fields=["profile_picture_data", "profile_picture_content_type",
                                   "profile_picture_filename", "updated_at"])

    return Response(
        {
            "success": True,
            "message": "Profile picture removed successfully.",
            "data": ProfileSerializer(
                request.user,
                context={"request": request},
            ).data,
        },
        status=status.HTTP_200_OK,
    )



class AdminSystemSettingsView(APIView):
    """
    GET: Retrieve the current system settings.
    PATCH/PUT: Update system settings.
    Access: Authenticated Django superusers only.
    """

    permission_classes = [IsAuthenticated]

    def check_admin(self, request):
        if not request.user.is_superuser:
            return Response(
                {
                    "success": False,
                    "message": "Only an Admin can manage system settings.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return None

    def get(self, request):
        denied = self.check_admin(request)
        if denied:
            return denied

        settings_obj = SystemSettings.load()
        serializer = SystemSettingsSerializer(settings_obj)

        return Response(
            {
                "success": True,
                "message": "System settings retrieved successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request):
        denied = self.check_admin(request)
        if denied:
            return denied

        settings_obj = SystemSettings.load()
        serializer = SystemSettingsSerializer(
            settings_obj,
            data=request.data,
            partial=True,
        )

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Please correct the settings errors.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer.save(updated_by=request.user)

        return Response(
            {
                "success": True,
                "message": "System settings updated successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    def put(self, request):
        denied = self.check_admin(request)
        if denied:
            return denied

        settings_obj = SystemSettings.load()
        serializer = SystemSettingsSerializer(
            settings_obj,
            data=request.data,
        )

        if not serializer.is_valid():
            return Response(
                {
                    "success": False,
                    "message": "Please correct the settings errors.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer.save(updated_by=request.user)

        return Response(
            {
                "success": True,
                "message": "System settings updated successfully.",
                "data": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


def is_student(user):
    """Recognize students through the project's existing role mechanisms."""
    if not user or not user.is_authenticated:
        return False

    # Match the same group-based role validation used by login_view.
    if user.groups.filter(name__iexact="STUDENT").exists():
        return True

    # Support installations that also store the role on the user model.
    role = getattr(user, "role", None)
    role = getattr(role, "name", role)

    if str(role or "").strip().upper() == "STUDENT":
        return True

    return False


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def student_profile(request):
    """
    Retrieve or update the authenticated student's own profile.
    """
    if not is_student(request.user):
        return Response(
            {"detail": "Student access required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.method == "GET":
        serializer = StudentProfileSerializer(
            request.user,
            context={"request": request},
        )
        return Response({
            "success": True,
            "data": serializer.data,
        })

    serializer = StudentProfileSerializer(
        request.user,
        data=request.data,
        partial=True,
        context={"request": request},
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()

    return Response({
        "success": True,
        "message": "Profile updated successfully.",
        "data": StudentProfileSerializer(
            request.user,
            context={"request": request},
        ).data,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_student_profile_picture(request):
    """Upload or replace the logged-in student's profile picture."""
    if not is_student(request.user):
        return Response(
            {"detail": "Student access required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    image = request.FILES.get("profile_picture")

    if not image:
        return Response(
            {"detail": "Select a profile picture to upload."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    extension = os.path.splitext(image.name)[1].lower()

    if extension not in {".jpg", ".jpeg", ".png"}:
        return Response(
            {"detail": "Only JPG and PNG images are allowed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if image.size > 5 * 1024 * 1024:
        return Response(
            {"detail": "Image size must not exceed 5 MB."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate the actual image contents.
    try:
        image.seek(0)
        with Image.open(image) as uploaded_image:
            if uploaded_image.format not in {"JPEG", "PNG"}:
                raise ValueError("Unsupported image format.")
            uploaded_image.verify()
        image.seek(0)
    except Exception:
        return Response(
            {"detail": "The uploaded file is not a valid JPG or PNG image."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Use the existing Student profile related to the logged-in User.
    try:
        student = request.user.student_profile
    except ObjectDoesNotExist:
        return Response(
            {"detail": "No student profile is linked to this account."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # The profile model must contain the profile_image ImageField.
    try:
        student._meta.get_field("profile_image")
    except FieldDoesNotExist:
        return Response(
            {
                "detail": (
                    "The existing Student model does not have a "
                    "profile_image field. Add it to that model and "
                    "run migrations before uploading."
                )
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    old_image = student.profile_image

    # Save the new image first; preserve the old one if saving fails.
    try:
        student.profile_image = image
        student.save(update_fields=["profile_image"])
    except Exception:
        return Response(
            {"detail": "Unable to save the profile picture."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Delete the old file only after the new image has been saved.
    if old_image and old_image.name != student.profile_image.name:
        try:
            old_image.delete(save=False)
        except Exception:
            pass

    return Response(
        {
            "success": True,
            "message": "Profile picture updated successfully.",
            "data": StudentProfileSerializer(
                request.user,
                context={"request": request},
            ).data,
        },
        status=status.HTTP_200_OK,
    )



@api_view(["POST"])
@permission_classes([IsAuthenticated])
def student_change_password(request):
    """
    Change the authenticated student's password securely.
    """
    if not is_student(request.user):
        return Response(
            {"detail": "Student access required."},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = StudentChangePasswordSerializer(
        data=request.data,
        context={"request": request},
    )
    serializer.is_valid(raise_exception=True)

    request.user.set_password(
        serializer.validated_data["new_password"]
    )
    request.user.save(update_fields=["password"])

    return Response({
        "success": True,
        "message": "Password changed successfully.",
    })