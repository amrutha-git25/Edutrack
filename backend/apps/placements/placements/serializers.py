from rest_framework import serializers

from .models import Placement, PlacementApplication


class PlacementSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    application_count = serializers.SerializerMethodField()

    class Meta:
        model = Placement
        fields = [
            "id",
            "student",
            "student_name",
            "company_name",
            "position",
            "package",
            "placement_date",
            "status",
            "notes",
            "is_archived",
            "created_by",
            "created_by_name",
            "application_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "student_name",
            "created_by",
            "created_by_name",
            "application_count",
            "created_at",
            "updated_at",
            "is_archived",
        ]

    def get_student_name(self, obj):
        if not obj.student:
            return None

        full_name = obj.student.get_full_name()
        return full_name or getattr(obj.student, "email", str(obj.student))

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return None

        full_name = obj.created_by.get_full_name()
        return full_name or getattr(
            obj.created_by,
            "email",
            str(obj.created_by),
        )

    def get_application_count(self, obj):
        return obj.applications.count()

    def validate_company_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Company name is required."
            )
        return value

    def validate_position(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Job position is required."
            )
        return value

    def validate_package(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Package or CTC is required."
            )
        return value


class PlacementApplicationSerializer(serializers.ModelSerializer):
    placement_company = serializers.CharField(
        source="placement.company_name",
        read_only=True,
    )
    placement_position = serializers.CharField(
        source="placement.position",
        read_only=True,
    )
    package = serializers.CharField(
        source="placement.package",
        read_only=True,
    )
    student_name = serializers.SerializerMethodField()

    class Meta:
        model = PlacementApplication
        fields = [
            "id",
            "placement",
            "placement_company",
            "placement_position",
            "package",
            "student",
            "student_name",
            "status",
            "applied_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "placement",
            "student",
            "student_name",
            "status",
            "applied_at",
            "updated_at",
        ]

    def get_student_name(self, obj):
        full_name = obj.student.get_full_name()
        return full_name or getattr(
            obj.student,
            "email",
            str(obj.student),
        )