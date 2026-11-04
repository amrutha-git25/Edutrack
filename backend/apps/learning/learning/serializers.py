
from rest_framework import serializers
from .models import LiveClass  


class LiveClassSerializer(serializers.ModelSerializer):
    mentor_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LiveClass
        fields = [
            "id",
            "title",
            "description",
            "course_name",
            "mentor",
            "mentor_name",
            "scheduled_at",
            "duration_minutes",
            "meeting_url",
            "status",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def get_mentor_name(self, obj):
        return obj.mentor.get_full_name() or obj.mentor.get_username()

    def get_created_by_name(self, obj):
        return (
            obj.created_by.get_full_name()
            or obj.created_by.get_username()
        )

from rest_framework import serializers
from .models import Certificate


class CertificateSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_pin = serializers.CharField(
        source="student.pin_number",
        read_only=True
    )
    course_title = serializers.CharField(
        source="course.title",
        read_only=True
    )
    issued_by_name = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Certificate
        fields = [
            "id",
            "certificate_number",
            "student",
            "student_name",
            "student_pin",
            "course",
            "course_title",
            "issued_by",
            "issued_by_name",
            "issued_at",
            "download_url",
        ]
        read_only_fields = [
            "id",
            "certificate_number",
            "issued_by",
            "issued_at",
            "download_url",
        ]

    def get_student_name(self, obj):
        user = obj.student.user
        return user.get_full_name() or user.get_username()

    def get_issued_by_name(self, obj):
        return (
            obj.issued_by.get_full_name()
            or obj.issued_by.get_username()
        )

    def get_download_url(self, obj):
        request = self.context.get("request")
        path = f"/api/learning/certificates/{obj.pk}/download/"

        if request:
            return request.build_absolute_uri(path)

        return path


class CertificateIssueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certificate
        fields = ["student", "course"]

    def validate(self, attrs):
        student = attrs["student"]
        course = attrs["course"]

        if not student.is_active or not student.user.is_active:
            raise serializers.ValidationError({
                "student": "Cannot issue a certificate to an inactive student."
            })

        if Certificate.objects.filter(
            student=student,
            course=course
        ).exists():
            raise serializers.ValidationError({
                "course": "This student already has a certificate for this course."
            })

        return attrs