from django.contrib import admin

from .models import Placement, PlacementApplication


@admin.register(Placement)
class PlacementAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "company_name",
        "position",
        "package",
        "placement_date",
        "status",
        "is_archived",
    )
    list_filter = ("status", "is_archived", "placement_date")
    search_fields = ("company_name", "position", "package")
    readonly_fields = ("created_at", "updated_at")


@admin.register(PlacementApplication)
class PlacementApplicationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "student",
        "placement",
        "status",
        "applied_at",
    )
    list_filter = ("status", "applied_at")
    search_fields = (
        "student__email",
        "placement__company_name",
        "placement__position",
    )
    readonly_fields = ("applied_at", "updated_at")