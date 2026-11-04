
from django.urls import path
from . import views

urlpatterns = [
    path(
        "students/",
        views.student_list_create,
        name="student-list-create",
    ),
    path(
        "students/<int:student_id>/",
        views.student_detail,
        name="student-detail",
    ),
    path(
        "mentors/",
        views.mentor_list_create,
        name="mentor-list-create",
    ),
    path(
        "mentors/<int:mentor_id>/",
        views.mentor_detail,
        name="mentor-detail",
    ),
    path("admins/", views.admin_create, name="admin-create"),
    path("export/", views.export_users, name="export-users"),
    
path(
    "student/settings/",
    views.student_settings,
    name="student-settings",
),
 path(
        "admins/",
        views.admin_list_delete,
        name="admin-list"
    ),
    path(
        "admins/<int:admin_id>/",
        views.admin_list_delete,
        name="admin-delete"
    ),

]
