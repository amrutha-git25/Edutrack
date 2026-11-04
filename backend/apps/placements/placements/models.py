from django.conf import settings
from django.db import models


class Placement(models.Model):
    STATUS_CHOICES = [
        ("open", "Open"),
        ("upcoming", "Upcoming"),
        ("closed", "Closed"),
        ("placed", "Placed"),
        ("offer", "Offer"),
    ]

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="placement_records",
    )
    company_name = models.CharField(max_length=255)
    position = models.CharField(max_length=255)
    package = models.CharField(
        max_length=100,
        help_text="Example: 8 LPA or ₹12 LPA",
    )
    placement_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="open",
    )
    notes = models.TextField(blank=True, default="")

    is_archived = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_placement_records",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "is_archived"]),
            models.Index(fields=["company_name"]),
        ]

    def __str__(self):
        return f"{self.company_name} - {self.position}"


class PlacementApplication(models.Model):
    APPLICATION_STATUS_CHOICES = [
        ("applied", "Applied"),
        ("shortlisted", "Shortlisted"),
        ("interview", "Interview"),
        ("selected", "Selected"),
        ("rejected", "Rejected"),
        ("withdrawn", "Withdrawn"),
    ]

    placement = models.ForeignKey(
        Placement,
        on_delete=models.CASCADE,
        related_name="applications",
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="placement_applications",
    )
    status = models.CharField(
        max_length=30,
        choices=APPLICATION_STATUS_CHOICES,
        default="applied",
    )
    applied_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-applied_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["placement", "student"],
                name="unique_student_placement_application",
            )
        ]

    def __str__(self):
        return f"{self.student} - {self.placement}"