import re

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import SystemSettings, AdminProfile

User = get_user_model()


def validate_strong_password(password):
    """Require 8+ characters, uppercase, lowercase, number, and symbol."""

    if len(password) < 8:
        raise serializers.ValidationError(
            "Password must contain at least 8 characters."
        )

    if not re.search(r"[A-Z]", password):
        raise serializers.ValidationError(
            "Password must contain at least one uppercase letter."
        )

    if not re.search(r"[a-z]", password):
        raise serializers.ValidationError(
            "Password must contain at least one lowercase letter."
        )

    if not re.search(r"\d", password):
        raise serializers.ValidationError(
            "Password must contain at least one number."
        )

    if not re.search(r"[^A-Za-z0-9]", password):
        raise serializers.ValidationError(
            "Password must contain at least one special character."
        )

    return password


class SendOTPSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    phone_number = serializers.CharField(max_length=15)

    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    confirm_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    role = serializers.ChoiceField(
        choices=[
            ("STUDENT", "Student"),
            ("MENTOR", "Mentor"),
        ]
    )

    def validate_first_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "First name is required."
            )

        return value

    def validate_last_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Last name is required."
            )

        return value

    def validate_email(self, value):
        value = value.strip().lower()

        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )

        return value

    def validate_phone_number(self, value):
        value = value.strip()

        if not re.fullmatch(r"[6-9]\d{9}", value):
            raise serializers.ValidationError(
                "Enter a valid 10-digit Indian mobile number."
            )

        return value

    def validate_password(self, value):
        return validate_strong_password(value)

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({
                "confirm_password": "Passwords do not match."
            })

        return attrs


class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()

    otp = serializers.CharField(
        min_length=6,
        max_length=6,
        trim_whitespace=True,
    )

    def validate_email(self, value):
        return value.strip().lower()

    def validate_otp(self, value):
        if not value.isdigit() or len(value) != 6:
            raise serializers.ValidationError(
                "OTP must contain exactly 6 digits."
            )

        return value


class ResendOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()

    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    role = serializers.CharField()

    def validate_email(self, value):
        return value.strip().lower()

    def validate_role(self, value):
        role_map = {
            "student": "STUDENT",
            "mentor": "MENTOR",
            "admin": "ADMIN",
        }

        normalized = role_map.get(value.strip().lower())

        if not normalized:
            raise serializers.ValidationError(
                "Role must be Student, Mentor, or Admin."
            )

        return normalized


class ProfileSerializer(serializers.Serializer):
    first_name = serializers.CharField(
        max_length=150,
        required=False,
    )

    last_name = serializers.CharField(
        max_length=150,
        required=False,
    )

    email = serializers.EmailField(required=False)

    phone_number = serializers.CharField(
        max_length=15,
        required=False,
        allow_blank=True,
    )

    def validate_first_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "First name is required."
            )

        return value

    def validate_last_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Last name is required."
            )

        return value

    def validate_email(self, value):
        value = value.strip().lower()

        User = get_user_model()
        user = self.context["request"].user

        if User.objects.filter(
            email__iexact=value
        ).exclude(pk=user.pk).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )

        return value

    def validate_phone_number(self, value):
        value = value.strip()

        if value and not re.fullmatch(r"[6-9]\d{9}", value):
            raise serializers.ValidationError(
                "Enter a valid 10-digit Indian mobile number."
            )

        return value

    def update(self, instance, validated_data):
        # Update fields stored on Django's User model.
        for field in ("first_name", "last_name", "email"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])

        instance.save()

        # Phone number is stored separately in AdminProfile.
        profile, _ = AdminProfile.objects.get_or_create(
            user=instance
        )

        if "phone_number" in validated_data:
            profile.phone_number = validated_data["phone_number"]

            profile.save(
                update_fields=[
                    "phone_number",
                    "updated_at",
                ]
            )

        return instance

    def to_representation(self, instance):
        profile, _ = AdminProfile.objects.get_or_create(
            user=instance
        )

        request = self.context.get("request")

        picture_url = None

        # Profile picture is stored as binary data in PostgreSQL.
        if profile.profile_picture_data:
            picture_url = "/api/auth/profile/photo/content/"

            if request:
                picture_url = request.build_absolute_uri(
                    picture_url
                )

        return {
            "id": instance.pk,
            "first_name": instance.first_name,
            "last_name": instance.last_name,
            "full_name": instance.get_full_name().strip(),
            "email": instance.email,
            "phone_number": profile.phone_number,
            "profile_picture": picture_url,
            "updated_at": profile.updated_at,
        }


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    new_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    confirm_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    def validate_new_password(self, value):
        return validate_strong_password(value)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({
                "confirm_password": "Passwords do not match."
            })

        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError({
                "new_password": (
                    "Your new password must differ from "
                    "your current password."
                )
            })

        return attrs


class SystemSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSettings

        fields = [
            "platform_name",
            "support_email",
            "support_phone",
            "maintenance_mode",
            "allow_student_registration",
            "allow_mentor_registration",
            "email_notifications_enabled",
            "default_theme",
            "session_timeout_minutes",
            "updated_at",
        ]

        read_only_fields = ["updated_at"]

    def validate_platform_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Platform name cannot be empty."
            )

        return value

    def validate_support_phone(self, value):
        value = value.strip()

        if value and len(value) > 20:
            raise serializers.ValidationError(
                "Support phone number is too long."
            )

        return value


class StudentProfileSerializer(serializers.ModelSerializer):
    profile_picture = serializers.SerializerMethodField()

    class Meta:
        model = User

        fields = [
            "id",
            "first_name",
            "last_name",
            "email",
            "profile_picture",
            "date_joined",
        ]

        read_only_fields = [
            "id",
            "date_joined",
        ]

    def get_profile_picture(self, obj):
        """Return the image URL stored on the user's Student profile."""

        try:
            student = obj.student_profile
            image = student.profile_image

        except (AttributeError, ValueError):
            return None

        if not image or not image.name:
            return None

        try:
            image_url = image.url

        except ValueError:
            return None

        request = self.context.get("request")

        return (
            request.build_absolute_uri(image_url)
            if request
            else image_url
        )

    def validate_first_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "First name is required."
            )

        return value

    def validate_last_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Last name is required."
            )

        return value

    def validate_email(self, value):
        value = value.strip().lower()

        if User.objects.filter(
            email__iexact=value
        ).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError(
                "This email address is already in use."
            )

        return value


class StudentChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    new_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    confirm_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    def validate(self, attrs):
        user = self.context["request"].user

        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({
                "current_password": "Current password is incorrect."
            })

        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({
                "confirm_password": "New passwords do not match."
            })

        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError({
                "new_password": (
                    "Your new password must differ from "
                    "your current password."
                )
            })

        validate_password(attrs["new_password"], user)

        return attrs