
from django.contrib import admin
from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "recipient",
        "is_read",
        "created_at",
    )
    list_filter = ("is_read", "notification_type", "created_at")
    search_fields = (
        "title",
        "message",
        "recipient__email",
    )
    readonly_fields = ("created_at",)
