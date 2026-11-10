
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models


class SystemSettings(models.Model):
    """
    Singleton record containing EduTrack's system-wide settings.
    Only one settings record is maintained, with primary key 1.
    """

    THEME_CHOICES = [
        ("dark", "Dark"),
        ("light", "Light"),
        ("yellow", "Yellow"),
    ]

    platform_name = models.CharField(
        max_length=100,
        default="EduTrack",
    )
    support_email = models.EmailField(
        blank=True,
        default="",
    )
    support_phone = models.CharField(
        max_length=20,
        blank=True,
        default="",
    )

    maintenance_mode = models.BooleanField(default=False)
    allow_student_registration = models.BooleanField(default=True)
    allow_mentor_registration = models.BooleanField(default=True)
    email_notifications_enabled = models.BooleanField(default=True)

    default_theme = models.CharField(
        max_length=10,
        choices=THEME_CHOICES,
        default="dark",
    )
    session_timeout_minutes = models.PositiveIntegerField(
        default=30,
        validators=[
            MinValueValidator(5),
            MaxValueValidator(1440),
        ],
    )

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_system_settings",
    )

    class Meta:
        verbose_name = "System Settings"
        verbose_name_plural = "System Settings"

    def save(self, *args, **kwargs):
        # Keep a single global settings record.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        # Create the default settings record on first access.
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "EduTrack System Settings"



class AdminProfile(models.Model):
    """Additional profile details for an EduTrack administrator."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="admin_profile",
    )
    phone_number = models.CharField(max_length=15, blank=True, default="")
    # Store image bytes directly in PostgreSQL (Neon), not Render's filesystem.
    profile_picture_data = models.BinaryField(blank=True, null=True)
    profile_picture_content_type = models.CharField(max_length=50, blank=True, default="")
    profile_picture_filename = models.CharField(max_length=255, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Admin profile: {self.user.email}"
