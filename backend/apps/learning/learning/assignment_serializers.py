from rest_framework import serializers

from .models import Assignment, AssignmentSubmission


class AssignmentSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(
        source="course.title",
        read_only=True,
        default="",
    )
    submission_status = serializers.SerializerMethodField()
    grade = serializers.SerializerMethodField()
    feedback = serializers.SerializerMethodField()
    submission_id = serializers.SerializerMethodField()
    submitted_at = serializers.SerializerMethodField()
    submission_file_url = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id",
            "course",
            "course_name",
            "topic_title",
            "title",
            "instructions",
            "due_date",
            "total_marks",
            "reference_file",
            "status",
            "created_at",
            "submission_status",
            "submission_id",
            "submitted_at",
            "submission_file_url",
            "grade",
            "feedback",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "submission_status",
            "submission_id",
            "submitted_at",
            "submission_file_url",
            "grade",
            "feedback",
        ]

    def validate_total_marks(self, value):
        if value < 1:
            raise serializers.ValidationError("Total marks must be at least 1.")
        return value

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Assignment title is required.")
        return value

    def validate_instructions(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Instructions are required.")
        return value

    def _submission(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None

        return obj.submissions.filter(
            student=request.user
        ).first()

    def get_submission_status(self, obj):
        submission = self._submission(obj)
        return submission.status if submission else "pending"

    def get_submission_id(self, obj):
        submission = self._submission(obj)
        return submission.pk if submission else None

    def get_submitted_at(self, obj):
        submission = self._submission(obj)
        return submission.submitted_at if submission else None

    def get_submission_file_url(self, obj):
        submission = self._submission(obj)
        if not submission or not submission.submission_file:
            return None

        request = self.context.get("request")
        url = submission.submission_file.url
        return request.build_absolute_uri(url) if request else url

    def get_grade(self, obj):
        submission = self._submission(obj)
        if submission and submission.status == "reviewed":
            return submission.grade
        return None

    def get_feedback(self, obj):
        submission = self._submission(obj)
        if submission and submission.status == "reviewed":
            return submission.feedback
        return None


class AssignmentSubmissionSerializer(serializers.ModelSerializer):
    assignment_title = serializers.CharField(
        source="assignment.title",
        read_only=True,
    )
    student_name = serializers.SerializerMethodField()
    student_email = serializers.EmailField(source="student.email", read_only=True)
    total_marks = serializers.IntegerField(
        source="assignment.total_marks",
        read_only=True,
    )
    submission_file_url = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AssignmentSubmission
        fields = [
            "id",
            "assignment",
            "assignment_title",
            "student_name",
            "student_email",
            "submission_file",
            "submission_file_url",
            "submission_text",
            "submitted_at",
            "status",
            "grade",
            "total_marks",
            "feedback",
            "reviewed_at",
            "reviewed_by_name",
        ]
        read_only_fields = [
            "id",
            "assignment_title",
            "student_name",
            "student_email",
            "submission_file_url",
            "reviewed_by_name",
            "submitted_at",
            "status",
            "grade",
            "total_marks",
            "feedback",
            "reviewed_at",
        ]

    def get_student_name(self, obj):
        return obj.student.get_full_name() or obj.student.get_username()

    def get_submission_file_url(self, obj):
        if not obj.submission_file:
            return None
        request = self.context.get("request")
        url = obj.submission_file.url
        return request.build_absolute_uri(url) if request else url

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return None
        return obj.reviewed_by.get_full_name() or obj.reviewed_by.get_username()

    def validate(self, attrs):
        request = self.context["request"]
        assignment = attrs.get(
            "assignment",
            getattr(self.instance, "assignment", None),
        )

        if assignment is None:
            raise serializers.ValidationError(
                {"assignment": "An assignment is required."}
            )

        if assignment.status != "published":
            raise serializers.ValidationError(
                "This assignment is not open for submission."
            )

        if not attrs.get("submission_file") and not attrs.get(
            "submission_text"
        ):
            if not self.instance:
                raise serializers.ValidationError(
                    "Upload a file or enter your submission text."
                )

        # Prevent changing the assignment on an existing submission.
        if self.instance and assignment.pk != self.instance.assignment_id:
            raise serializers.ValidationError(
                {"assignment": "You cannot change the assignment."}
            )

        return attrs