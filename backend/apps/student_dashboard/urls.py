from django.urls import path
from .views import StudentDashboardView, StudySessionListCreateView

from .activity_views import (
    StudentMaterialProgressView,
)
from .activity_views import StudentLearningActivityView
app_name = "student_dashboard"

urlpatterns = [
    path("dashboard/", StudentDashboardView.as_view(), name="dashboard"),
    path("study-sessions/", StudySessionListCreateView.as_view(), name="study-sessions"),
      path(
        "dashboard/",
        StudentDashboardView.as_view(),
        name="dashboard",
    ),
    path(
        "study-sessions/",
        StudySessionListCreateView.as_view(),
        name="study-sessions",
    ),
    path(
        "learning-activity/",
        StudentLearningActivityView.as_view(),
        name="learning-activity",
    ),
    path(
    "learning-activity/<int:material_id>/",
    StudentMaterialProgressView.as_view(),
    name="material-progress",
),
]
