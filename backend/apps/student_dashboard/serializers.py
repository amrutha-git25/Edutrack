from rest_framework import serializers
from .models import StudySession


class StudySessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudySession
        fields = ("id", "started_at", "duration_minutes", "source", "note", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_duration_minutes(self, value):
        if value < 1:
            raise serializers.ValidationError("Duration must be at least 1 minute.")
        if value > 24 * 60:
            raise serializers.ValidationError("Duration cannot exceed 24 hours.")
        return value

    def validate_source(self, value):
        allowed = {"manual", "course", "video", "assignment", "quiz", "reading"}
        value = (value or "manual").strip().lower()
        if value not in allowed:
            raise serializers.ValidationError(
                "Source must be manual, course, video, assignment, quiz, or reading."
            )
        return value
