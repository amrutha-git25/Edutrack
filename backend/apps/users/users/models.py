
from django.conf import settings
from django.db import models


class Student(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="student_profile",
    )

    pin_number = models.CharField(
        max_length=30,
        unique=True,
    )

    percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
    )
    profile_image = models.ImageField(
    upload_to="profile_pictures/students/",
    blank=True,
    null=True,
)
    branch = models.CharField(max_length=100)
    section = models.CharField(max_length=20)

    phone_number = models.CharField(max_length=16)

    joined_at = models.DateTimeField(auto_now_add=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-joined_at"]

    def __str__(self):
        return f"{self.user.get_full_name()} ({self.pin_number})"


class MentorProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mentor_profile",
    )

    specialization = models.CharField(max_length=150)
    phone_number = models.CharField(max_length=16)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user.get_full_name()} - {self.specialization}"


class StudentSettings(models.Model):
    THEME_CHOICES = [
        ("dark", "Dark"),
        ("light", "Light"),
        ("yellow", "Yellow"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="student_settings",
    )

    theme = models.CharField(
        max_length=10,
        choices=THEME_CHOICES,
        default="dark",
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "student_settings"
        verbose_name = "Student Settings"
        verbose_name_plural = "Student Settings"

    def __str__(self):
        return f"Settings for {self.user}"

from .profile_models import UserProfilePicture