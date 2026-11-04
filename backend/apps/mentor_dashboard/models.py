from django.conf import settings
from django.db import models


class MentorPreference(models.Model):
    THEME_CHOICES = [
        ("light", "Light"),
        ("dark", "Dark"),
        ("yellow", "Yellow"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mentor_dashboard_preference",
    )
    theme = models.CharField(
        max_length=10,
        choices=THEME_CHOICES,
        default="yellow",
    )
    email_notifications = models.BooleanField(default=True)
    class_reminders = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Preferences for {self.user}"


class MentorActivity(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="mentor_dashboard_activities",
    )
    title = models.CharField(max_length=200)
    description = models.CharField(max_length=500, blank=True)
    activity_type = models.CharField(max_length=50, default="general")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title