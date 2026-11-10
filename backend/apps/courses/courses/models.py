
from django.conf import settings
from django.db import models
from .storage import EduTrackCloudinaryStorage

class Course(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    title = models.CharField(max_length=200)
    description = models.TextField()
    category = models.CharField(max_length=100)
    is_archived = models.BooleanField(default=False)
    mentor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edutrack_courses",
    )

    duration = models.CharField(max_length=100)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
    )

    thumbnail = models.ImageField(
        upload_to="course_thumbnails/",
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title


class Enrollment(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    student = models.ForeignKey(
        "users.Student",
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    course = models.ForeignKey(
        Course,
        on_delete=models.CASCADE,
        related_name="enrollments",
    )
    enrolled_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    progress = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
    )

    class Meta:
        ordering = ["-enrolled_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "course"],
                name="unique_student_course_enrollment",
            )
        ]

    def __str__(self):
        return f"{self.student} - {self.course.title}"


from django.conf import settings
from django.db import models


class MentorAssignment(models.Model):
    student = models.ForeignKey(
        "users.Student",
        on_delete=models.CASCADE,
        related_name="mentor_assignments",
    )

    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.CASCADE,
        related_name="student_mentor_assignments",
    )

    mentor = models.ForeignKey(
        "users.MentorProfile",
        on_delete=models.PROTECT,
        related_name="student_assignments",
    )

    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_mentor_assignments",
    )

    assigned_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-assigned_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["student", "course"],
                name="unique_student_course_mentor_assignment",
            )
        ]

    def __str__(self):
        return (
            f"{self.student} - {self.course.title} - "
            f"{self.mentor.user.get_full_name()}"
        )


from django.db import models


class Topic(models.Model):
    course = models.ForeignKey(
        "courses.Course",
        on_delete=models.CASCADE,
        related_name="topics",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["course", "title"],
                name="unique_topic_title_per_course",
            )
        ]

    def __str__(self):
        return f"{self.course} - {self.title}"


class Material(models.Model):
    MATERIAL_TYPES = [
        ("document", "Document"),
        ("video", "Video"),
        ("audio", "Audio"),
        ("presentation", "Presentation"),
        ("image", "Image"),
        ("other", "Other"),
    ]

    topic = models.ForeignKey(
        "courses.Topic",
        on_delete=models.CASCADE,
        related_name="materials",
    )

    title = models.CharField(max_length=255)

    description = models.TextField(blank=True)

    file = models.FileField(
    upload_to="course_materials/%Y/%m/",
    blank=True,
)
    supabase_url = models.URLField(blank=True, default="")

    material_type = models.CharField(
        max_length=20,
        choices=MATERIAL_TYPES,
        default="document",
    )
    binary_content = models.BinaryField(
    null=True,
    blank=True,
    )

    binary_filename = models.CharField(
    max_length=255,
    blank=True,
    default="",
    )

    binary_content_type = models.CharField(
    max_length=100,
    blank=True,
    default="",
    )
    is_published = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

