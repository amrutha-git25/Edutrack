from django.urls import path

from .views import GenerateAIExamView, SaveAIExamView
from .quiz_views import (
    StudentExamListView,
    StudentExamDetailView,
    StartStudentExamAttemptView,
    SubmitStudentExamAttemptView,
    StudentExamResultView,
)

app_name = "ai_services"

urlpatterns = [
    # Existing AI exam routes
    path("exams/generate/", GenerateAIExamView.as_view(), name="generate-ai-exam"),
    path("exams/save/", SaveAIExamView.as_view(), name="save-ai-exam"),

    # Student quiz routes
    path("student/exams/", StudentExamListView.as_view(), name="student-exam-list"),
    path("student/exams/<int:exam_id>/", StudentExamDetailView.as_view(), name="student-exam-detail"),
    path("student/exams/<int:exam_id>/attempts/", StartStudentExamAttemptView.as_view(), name="student-exam-start"),
    path("student/attempts/<int:attempt_id>/submit/", SubmitStudentExamAttemptView.as_view(), name="student-exam-submit"),
    path("student/attempts/<int:attempt_id>/result/", StudentExamResultView.as_view(), name="student-exam-result"),
]
