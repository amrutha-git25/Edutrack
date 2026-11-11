from rest_framework import serializers
from .models import Course
from .storage import upload_course_thumbnail


class SupabaseThumbnailImageField(serializers.ImageField):
    """Return the Supabase URL stored in the thumbnail field."""

    def to_representation(self, value):
        if not value:
            return None

        return getattr(value, "name", value)


class CourseSerializer(serializers.ModelSerializer):
    mentor_name = serializers.SerializerMethodField()

    thumbnail = SupabaseThumbnailImageField(
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Course

        fields = [
            "id",
            "title",
            "description",
            "category",
            "mentor",
            "mentor_name",
            "duration",
            "status",
            "thumbnail",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "mentor_name",
        ]

    def get_mentor_name(self, obj):
        if obj.mentor:
            return (
                obj.mentor.get_full_name()
                or obj.mentor.username
            )

        return None

    def create(self, validated_data):
        uploaded_thumbnail = validated_data.pop(
            "thumbnail",
            None,
        )

        if uploaded_thumbnail:
            try:
                thumbnail_url = upload_course_thumbnail(
                    uploaded_thumbnail
                )

                validated_data["thumbnail"] = thumbnail_url

            except Exception as exc:
                raise serializers.ValidationError({
                    "thumbnail": (
                        f"Supabase thumbnail upload failed: {exc}"
                    )
                }) from exc

        return Course.objects.create(**validated_data)

    def update(self, instance, validated_data):
        uploaded_thumbnail = validated_data.pop(
            "thumbnail",
            None,
        )

        if uploaded_thumbnail:
            try:
                thumbnail_url = upload_course_thumbnail(
                    uploaded_thumbnail
                )

                instance.thumbnail = thumbnail_url

            except Exception as exc:
                raise serializers.ValidationError({
                    "thumbnail": (
                        f"Supabase thumbnail upload failed: {exc}"
                    )
                }) from exc

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()

        return instance

from rest_framework import serializers
from .models import Enrollment


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_email = serializers.EmailField(
        source="student.user.email",
        read_only=True,
    )
    course_name = serializers.CharField(
        source="course.title",
        read_only=True,
    )

    class Meta:
        model = Enrollment
        fields = [
            "id",
            "student",
            "student_name",
            "student_email",
            "course",
            "course_name",
            "enrolled_at",
            "status",
            "progress",
        ]
        read_only_fields = ["id", "enrolled_at"]

    def get_student_name(self, obj):
        user = obj.student.user
        return user.get_full_name() or user.username

    def validate_progress(self, value):
        if not 0 <= value <= 100:
            raise serializers.ValidationError(
                "Progress must be between 0 and 100."
            )
        return value


from rest_framework import serializers
from .models import Course, Enrollment, MentorAssignment
from apps.users.users.models import Student, MentorProfile


class EnrollmentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    course_title = serializers.CharField(
        source="course.title",
        read_only=True,
    )

    class Meta:
        model = Enrollment
        fields = [
            "id",
            "student",
            "student_name",
            "course",
            "course_title",
            "enrolled_at",
            "status",
            "progress",
        ]
        read_only_fields = ["id", "enrolled_at"]

    def get_student_name(self, obj):
        return obj.student.user.get_full_name()


class MentorAssignmentSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_pin = serializers.CharField(
        source="student.pin_number",
        read_only=True,
    )
    subject_name = serializers.CharField(
        source="course.title",
        read_only=True,
    )
    mentor_name = serializers.SerializerMethodField()
    mentor_email = serializers.EmailField(
        source="mentor.user.email",
        read_only=True,
    )

    class Meta:
        model = MentorAssignment
        fields = [
            "id",
            "student",
            "student_name",
            "student_pin",
            "course",
            "subject_name",
            "mentor",
            "mentor_name",
            "mentor_email",
            "assigned_by",
            "assigned_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "assigned_by",
            "assigned_at",
            "updated_at",
        ]

    def get_student_name(self, obj):
        return obj.student.user.get_full_name()

    def get_mentor_name(self, obj):
        return obj.mentor.user.get_full_name()

    def validate(self, attrs):
        student = attrs.get(
            "student",
            getattr(self.instance, "student", None),
        )
        course = attrs.get(
            "course",
            getattr(self.instance, "course", None),
        )
        mentor = attrs.get(
            "mentor",
            getattr(self.instance, "mentor", None),
        )

        if student and (
            not student.is_active or not student.user.is_active
        ):
            raise serializers.ValidationError({
                "student": "Select an active student."
            })

        if mentor and (
            not mentor.is_active or not mentor.user.is_active
        ):
            raise serializers.ValidationError({
                "mentor": "Select an active mentor."
            })

        if course and course.status == Course.Status.ARCHIVED:
            raise serializers.ValidationError({
                "course": "Archived subjects cannot be assigned."
            })

        return attrs


# Topic and learning material serializers
from .models import Topic, Material
from django.core.validators import FileExtensionValidator

class TopicSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="title", required=True)
    materials_count = serializers.IntegerField(source="materials.count", read_only=True)

    class Meta:
        model = Topic
        fields = ["id", "course", "name", "title", "description", "order",
                  "materials_count", "created_at", "updated_at"]
        read_only_fields = ["id", "course", "title", "materials_count",
                            "created_at", "updated_at"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Topic name is required.")
        return value

class MaterialSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = Material
        fields = [
            "id",
            "topic",
            "title",
            "description",
            "file",
            "file_url",
            "file_name",
            "material_type",
            "is_published",
            "binary_content",
            "binary_filename",
            "binary_content_type",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "topic",
            "file_url",
            "file_name",
            "binary_content",
            "binary_filename",
            "binary_content_type",
            "created_at",
            "updated_at",
        ]

    def get_file_url(self, obj):
        request = self.context.get("request")

        if obj.binary_content is not None:
            from django.urls import reverse

            url = reverse(
                "material-binary",
                kwargs={"material_id": obj.id},
            )

            return request.build_absolute_uri(url) if request else url

        if obj.file:
            url = obj.file.url
            return request.build_absolute_uri(url) if request else url

        return None

    def get_file_name(self, obj):
        if obj.binary_filename:
            return obj.binary_filename

        if obj.file:
            return obj.file.name.rsplit("/", 1)[-1]

        return None

    def validate_file(self, value):
        if value.size > 100 * 1024 * 1024:
            raise serializers.ValidationError(
                "File size must not exceed 100 MB."
            )

        allowed = {
            "pdf", "doc", "docx", "ppt", "pptx",
            "xls", "xlsx", "odt", "ods", "odp", "rtf",
            "txt", "csv",
            "mp4", "webm", "mov", "m4v",
            "mp3", "wav", "ogg",
            "png", "jpg", "jpeg", "webp",
        }

        extension = (
            value.name.rsplit(".", 1)[-1].lower()
            if "." in value.name
            else ""
        )

        if extension not in allowed:
            raise serializers.ValidationError(
                "Unsupported file type."
            )

        return value

    def create(self, validated_data):
        uploaded_file = validated_data.pop("file", None)

        material = Material.objects.create(**validated_data)

        if uploaded_file:
            material.binary_content = uploaded_file.read()
            material.binary_filename = uploaded_file.name
            material.binary_content_type = (
                uploaded_file.content_type
                or "application/octet-stream"
            )
            material.file = ""

            material.save(
                update_fields=[
                    "binary_content",
                    "binary_filename",
                    "binary_content_type",
                    "file",
                    "updated_at",
                ]
            )

        return material

    def update(self, instance, validated_data):
        uploaded_file = validated_data.pop("file", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if uploaded_file:
            instance.binary_content = uploaded_file.read()
            instance.binary_filename = uploaded_file.name
            instance.binary_content_type = (
                uploaded_file.content_type
                or "application/octet-stream"
            )

            # New uploads are stored in Neon, not the legacy FileField.
            instance.file = ""

        instance.save()

        return instance