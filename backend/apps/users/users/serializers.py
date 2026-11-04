
from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Student

User = get_user_model()


class StudentSerializer(serializers.ModelSerializer):
    first_name = serializers.CharField(
        source="user.first_name",
        max_length=150,
    )
    last_name = serializers.CharField(
        source="user.last_name",
        max_length=150,
    )
    email = serializers.EmailField(
        source="user.email",
        required=False,
    )

    class Meta:
        model = Student
        fields = [
            "id",
            "first_name",
            "last_name",
            "email",
            "pin_number",
            "percentage",
            "branch",
            "section",
            "phone_number",
            "joined_at",
            "is_active",
        ]
        read_only_fields = ["id", "joined_at"]



import re


class AdminCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(
        write_only=True,
        min_length=8,
        trim_whitespace=False,
    )

    def validate_username(self, value):
        value = value.strip()

        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(
                "This username is already in use."
            )

        return value

    def validate_email(self, value):
        value = value.strip().lower()

        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )

        return value

    def validate_password(self, value):
        if not re.search(r"[A-Z]", value):
            raise serializers.ValidationError(
                "Password must contain an uppercase letter."
            )

        if not re.search(r"[a-z]", value):
            raise serializers.ValidationError(
                "Password must contain a lowercase letter."
            )

        if not re.search(r"\d", value):
            raise serializers.ValidationError(
                "Password must contain a number."
            )

        if not re.search(r"[^A-Za-z0-9]", value):
            raise serializers.ValidationError(
                "Password must contain a special character."
            )

        return value



from .models import StudentSettings


class StudentSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentSettings
        fields = ["theme", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_theme(self, value):
        allowed_themes = {"dark", "light", "yellow"}

        if value not in allowed_themes:
            raise serializers.ValidationError(
                "Theme must be dark, light, or yellow."
            )

        return value
