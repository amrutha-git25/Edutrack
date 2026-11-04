from django.conf import settings
from django.db import models
from django.utils import timezone


class StudySession(models.Model):
    """A student's completed study session used to build the activity heatmap."""

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="study_sessions",
    )
    started_at = models.DateTimeField(default=timezone.now)
    duration_minutes = models.PositiveIntegerField(default=0)
    source = models.CharField(max_length=40, blank=True, default="manual")
    note = models.CharField(max_length=250, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-started_at",)
        indexes = [
            models.Index(fields=["student", "started_at"]),
        ]

    def __str__(self):
        return f"{self.student_id} — {self.started_at:%Y-%m-%d} — {self.duration_minutes} min"

class StudentLearningActivity(models.Model):
    """
    Tracks a student's learning activity across videos, documents and quizzes.
    """

    ACTIVITY_CHOICES = [
        ("video", "Video"),
        ("document", "Document"),
        ("quiz", "Quiz"),
    ]

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="learning_activities",
    )

    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.CASCADE,
        related_name="student_learning_activities",
    )

    material = models.ForeignKey(
        "courses.Material",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="student_learning_activities",
    )

    exam_attempt = models.ForeignKey(
        "ai_services.ExamAttempt",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="learning_activity_records",
    )

    activity_type = models.CharField(
        max_length=20,
        choices=ACTIVITY_CHOICES,
    )

    # Total time spent on this activity, in seconds.
    duration_seconds = models.PositiveIntegerField(default=0)

    # Used by the video player to resume playback.
    last_position_seconds = models.PositiveIntegerField(default=0)

    # Original video duration, in seconds.
    media_duration_seconds = models.PositiveIntegerField(
        default=0,
        blank=True,
    )

    # Calculated completion percentage.
    progress_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
    )

    is_completed = models.BooleanField(default=False)

    started_at = models.DateTimeField(default=timezone.now)

    last_activity_at = models.DateTimeField(
        default=timezone.now,
    )

    completed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-last_activity_at",)
        indexes = [
            models.Index(fields=["student", "course"]),
            models.Index(fields=["student", "activity_type"]),
            models.Index(fields=["student", "last_activity_at"]),
            models.Index(fields=["course", "activity_type"]),
        ]

    def __str__(self):
        return (
            f"{self.student_id} - "
            f"{self.course_id} - "
            f"{self.activity_type}"
        )