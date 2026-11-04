
from django.urls import path
from . import views

urlpatterns = [
    path("dashboard/", views.dashboard_report, name="dashboard-report"),
    path("courses/", views.course_report, name="course-report"),
    path("student-progress/", views.student_progress_report, name="student-progress-report"),
    path("users/", views.user_report, name="user-report"),
]
