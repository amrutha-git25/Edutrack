
from django.conf import settings
from django.db import models


class LiveClass(models.Model):
    STATUS_CHOICES = [
        ("scheduled", "Scheduled"),
        ("live", "Live"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    course_name = models.CharField(max_length=200)

    mentor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="mentored_live_classes",
    )

    scheduled_at = models.DateTimeField()
    duration_minutes = models.PositiveIntegerField(default=60)
    meeting_url = models.URLField(max_length=500, blank=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="scheduled",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_live_classes",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["scheduled_at"]

    def __str__(self):
        return self.title

class Attendance(models.Model):
    STATUS_CHOICES = [
        ("present", "Present"),
        ("absent", "Absent"),
    ]

    live_class = models.ForeignKey(
        LiveClass,
        on_delete=models.CASCADE,
        related_name="attendance_records",
    )

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="attendance_records",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="absent",
    )

    joined_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    recorded_at = models.DateTimeField(
        auto_now_add=True,
    )

    class Meta:
        ordering = ["-recorded_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["live_class", "student"],
                name="unique_student_live_class_attendance",
            )
        ]

    def __str__(self):
        return (
            f"{self.student} - "
            f"{self.live_class.title} - "
            f"{self.status}"
        )

import uuid

from django.conf import settings
from django.db import models


class Certificate(models.Model):
    certificate_number = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
    )

    student = models.ForeignKey(
        "users.Student",
        on_delete=models.PROTECT,
        related_name="certificates",
    )

    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.PROTECT,
        related_name="certificates",
    )

    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="issued_edutrack_certificates",
    )

    issued_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-issued_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "course"],
                name="unique_certificate_per_student_course",
            )
        ]

    def __str__(self):
        return (
            f"{self.certificate_number} - "
            f"{self.student} - {self.course}"
        )

# Add these imports at the top of models.py if they are not already present.
from django.conf import settings
from django.db import models
from django.utils import timezone


class Assignment(models.Model):
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("published", "Published"),
        ("archived", "Archived"),
    ]

    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.PROTECT,
        related_name="assignments",
    )
    topic_title = models.CharField(max_length=255, blank=True)
    title = models.CharField(max_length=255)
    instructions = models.TextField()
    due_date = models.DateTimeField()
    total_marks = models.PositiveIntegerField(default=100)

    reference_file = models.FileField(
        upload_to="assignments/references/",
        blank=True,
        null=True,
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="draft",
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_assignments",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["due_date"]
        indexes = [
            models.Index(fields=["course", "status"]),
            models.Index(fields=["due_date"]),
        ]

    def __str__(self):
        return self.title


class AssignmentSubmission(models.Model):
    STATUS_CHOICES = [
        ("submitted", "Submitted"),
        ("late", "Late"),
        ("reviewed", "Reviewed"),
    ]

    assignment = models.ForeignKey(
        Assignment,
        on_delete=models.CASCADE,
        related_name="submissions",
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="assignment_submissions",
    )

    submission_file = models.FileField(
        upload_to="assignments/submissions/",
        blank=True,
        null=True,
    )
    submission_text = models.TextField(blank=True)

    submitted_at = models.DateTimeField(auto_now_add=True)

    grade = models.DecimalField(
        max_digits=7,
        decimal_places=2,
        null=True,
        blank=True,
    )
    feedback = models.TextField(blank=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="submitted",
    )

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_assignment_submissions",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-submitted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["assignment", "student"],
                name="unique_assignment_student_submission",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.pk is None and self.assignment_id:
            if timezone.now() > self.assignment.due_date:
                self.status = "late"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.assignment.title} - {self.student}"