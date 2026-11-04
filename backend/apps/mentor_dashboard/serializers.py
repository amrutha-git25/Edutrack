from rest_framework import serializers
from .models import MentorPreference, MentorActivity


class MentorPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = MentorPreference
        fields = [
            "theme",
            "email_notifications",
            "class_reminders",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]


class MentorActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = MentorActivity
        fields = [
            "id",
            "title",
            "description",
            "activity_type",
            "created_at",
        ]
        read_only_fields = fields