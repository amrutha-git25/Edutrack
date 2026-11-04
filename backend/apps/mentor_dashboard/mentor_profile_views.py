
import os
import re

from PIL import Image

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.users.models import MentorProfile, UserProfilePicture
from .permissions import IsMentor


User = get_user_model()
MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG"}


def get_mentor_profile(request):
    return get_object_or_404(
        MentorProfile.objects.select_related("user"),
        user=request.user,
        is_active=True,
    )


def image_url(request, user):
    picture_record = UserProfilePicture.objects.filter(user=user).first()
    if not picture_record or not picture_record.image:
        return None

    try:
        return request.build_absolute_uri(picture_record.image.url)
    except (ValueError, AttributeError):
        return None


def mentor_profile_data(request, profile):
    user = profile.user

    return {
        "id": profile.pk,
        "user_id": user.pk,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.get_full_name().strip()
        or user.get_username(),
        "email": user.email,
        "phone_number": profile.phone_number,
        "specialization": profile.specialization,
        "profile_picture": image_url(request, user),
        "joined_at": profile.created_at.isoformat(),
        "updated_at": profile.updated_at.isoformat(),
    }


class MentorProfileView(APIView):
    permission_classes = [IsAuthenticated, IsMentor]

    def get(self, request):
        profile = get_mentor_profile(request)

        return Response({
            "success": True,
            "data": mentor_profile_data(request, profile),
        })

    def patch(self, request):
        profile = get_mentor_profile(request)
        user = profile.user

        first_name = request.data.get("first_name")
        last_name = request.data.get("last_name")
        email = request.data.get("email")
        phone_number = request.data.get("phone_number")
        specialization = request.data.get("specialization")

        errors = {}

        if first_name is not None:
            first_name = str(first_name).strip()
            if not first_name:
                errors["first_name"] = "First name is required."
            elif len(first_name) > 150:
                errors["first_name"] = "Maximum 150 characters."

        if last_name is not None:
            last_name = str(last_name).strip()
            if not last_name:
                errors["last_name"] = "Last name is required."
            elif len(last_name) > 150:
                errors["last_name"] = "Maximum 150 characters."

        if email is not None:
            email = str(email).strip().lower()
            from django.core.validators import validate_email

            try:
                validate_email(email)
            except DjangoValidationError:
                errors["email"] = "Enter a valid email address."

            if email and User.objects.filter(
                email__iexact=email
            ).exclude(pk=user.pk).exists():
                errors["email"] = (
                    "An account with this email already exists."
                )

            if email and User.objects.filter(
                username=email
            ).exclude(pk=user.pk).exists():
                errors["email"] = (
                    "This username is already in use."
                )

        if phone_number is not None:
            phone_number = str(phone_number).strip()
            if len(phone_number) > 16:
                errors["phone_number"] = (
                    "Phone number cannot exceed 16 characters."
                )
            elif phone_number and not re.fullmatch(
                r"[0-9+\-\s()]{7,16}", phone_number
            ):
                errors["phone_number"] = (
                    "Enter a valid phone number."
                )

        if specialization is not None:
            specialization = str(specialization).strip()
            if not specialization:
                errors["specialization"] = (
                    "Specialization cannot be empty."
                )
            elif len(specialization) > 150:
                errors["specialization"] = (
                    "Maximum 150 characters."
                )

        if errors:
            return Response({
                "success": False,
                "message": "Please correct the highlighted fields.",
                "errors": errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            if first_name is not None:
                user.first_name = first_name

            if last_name is not None:
                user.last_name = last_name

            if email is not None:
                user.email = email
                # Existing project creates mentor usernames from email.
                user.username = email

            if any(
                key in request.data
                for key in ("first_name", "last_name", "email")
            ):
                user.save()

            if phone_number is not None:
                profile.phone_number = phone_number

            if specialization is not None:
                profile.specialization = specialization

            if any(
                key in request.data
                for key in ("phone_number", "specialization")
            ):
                profile.save()

        profile.refresh_from_db()
        user.refresh_from_db()

        return Response({
            "success": True,
            "message": "Profile updated successfully.",
            "data": mentor_profile_data(request, profile),
        })


class MentorProfilePictureView(APIView):
    permission_classes = [IsAuthenticated, IsMentor]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        profile = get_mentor_profile(request)
        user = profile.user
        uploaded_image = request.FILES.get("profile_picture")

        if not uploaded_image:
            return Response({
                "success": False,
                "message": "Select a JPG or PNG image.",
            }, status=status.HTTP_400_BAD_REQUEST)

        extension = os.path.splitext(uploaded_image.name)[1].lower()

        if extension not in ALLOWED_IMAGE_EXTENSIONS:
            return Response({
                "success": False,
                "message": "Only JPG and PNG images are allowed.",
            }, status=status.HTTP_400_BAD_REQUEST)

        if uploaded_image.size > MAX_PROFILE_IMAGE_SIZE:
            return Response({
                "success": False,
                "message": "Image size must not exceed 5 MB.",
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            uploaded_image.seek(0)

            with Image.open(uploaded_image) as image:
                if image.format not in ALLOWED_IMAGE_FORMATS:
                    raise ValueError("Unsupported image format.")
                image.verify()

            uploaded_image.seek(0)

        except Exception:
            return Response({
                "success": False,
                "message": "The uploaded file is not a valid JPG or PNG image.",
            }, status=status.HTTP_400_BAD_REQUEST)

        picture_record, _ = UserProfilePicture.objects.get_or_create(
            user=user
        )

        old_image = picture_record.image
        if old_image:
            old_image.delete(save=False)

        picture_record.image = uploaded_image
        picture_record.save(update_fields=["image", "updated_at"])

        return Response({
            "success": True,
            "message": "Profile picture updated successfully.",
            "data": mentor_profile_data(request, profile),
        })

    def delete(self, request):
        profile = get_mentor_profile(request)
        user = profile.user
        picture_record = UserProfilePicture.objects.filter(user=user).first()

        if picture_record and picture_record.image:
            picture_record.image.delete(save=False)
            picture_record.image = None
            picture_record.save(update_fields=["image", "updated_at"])

        return Response({
            "success": True,
            "message": "Profile picture removed successfully.",
            "data": mentor_profile_data(request, profile),
        })



class MentorChangePasswordView(APIView):
    permission_classes = [IsAuthenticated, IsMentor]

    def post(self, request):
        current_password = request.data.get("current_password", "")
        new_password = request.data.get("new_password", "")
        confirm_password = request.data.get("confirm_password", "")

        errors = {}

        if not current_password:
            errors["current_password"] = (
                "Current password is required."
            )
        elif not request.user.check_password(current_password):
            errors["current_password"] = (
                "Current password is incorrect."
            )

        if not new_password:
            errors["new_password"] = "New password is required."
        elif new_password != confirm_password:
            errors["confirm_password"] = (
                "New passwords do not match."
            )
        elif current_password == new_password:
            errors["new_password"] = (
                "Choose a password different from your current password."
            )
        else:
            # Enforce Django's configured password validators.
            try:
                validate_password(new_password, user=request.user)
            except DjangoValidationError as exc:
                errors["new_password"] = list(exc.messages)

            # Enforce the project's strong-password policy as well.
            strong_password = (
                len(new_password) >= 8
                and re.search(r"[A-Z]", new_password)
                and re.search(r"[a-z]", new_password)
                and re.search(r"\d", new_password)
                and re.search(r"[^A-Za-z0-9]", new_password)
            )

            if not strong_password:
                errors["password_rules"] = (
                    "Use at least 8 characters, including uppercase, "
                    "lowercase, a number, and a special character."
                )

        if errors:
            return Response({
                "success": False,
                "message": "Unable to change password.",
                "errors": errors,
            }, status=status.HTTP_400_BAD_REQUEST)

        request.user.set_password(new_password)
        request.user.save(update_fields=["password"])

        return Response({
            "success": True,
            "message": (
                "Password changed successfully. Please sign in again "
                "if your current session expires."
            ),
        })
