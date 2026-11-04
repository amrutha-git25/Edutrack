
from django.contrib import admin
from .models import Student


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = (
        "pin_number",
        "user",
        "branch",
        "section",
        "percentage",
        "is_active",
        "joined_at",
    )

    search_fields = (
        "pin_number",
        "user__first_name",
        "user__last_name",
        "user__email",
    )

    list_filter = ("branch", "section", "is_active")


from .models import StudentSettings


@admin.register(StudentSettings)
class StudentSettingsAdmin(admin.ModelAdmin):
    list_display = ("user", "theme", "updated_at")
    list_filter = ("theme",)
    search_fields = (
        "user__username",
        "user__email",
        "user__first_name",
        "user__last_name",
    )
    readonly_fields = ("updated_at",)
