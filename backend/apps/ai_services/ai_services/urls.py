
from django.urls import path

from .views import GenerateAIExamView, SaveAIExamView
from .resume_views import (
    StudentResumeListCreateView,
    StudentResumeDetailView,
    StudentResumeAIImproveView,
    StudentResumeGenerateSummaryView,
)

from .quiz_views import (
    StudentExamListView,
    StudentExamDetailView,
    StartStudentExamAttemptView,
    SubmitStudentExamAttemptView,
    StudentExamResultView,
)

app_name = "ai_services"

urlpatterns = [
    # Existing AI exam generation
    path(
        "exams/generate/",
        GenerateAIExamView.as_view(),
        name="generate-ai-exam",
    ),
    path(
        "exams/save/",
        SaveAIExamView.as_view(),
        name="save-ai-exam",
    ),

    # Student AI Resume Builder
    path("student/resumes/", StudentResumeListCreateView.as_view(), name="student-resume-list-create"),
    path("student/resumes/<int:resume_id>/", StudentResumeDetailView.as_view(), name="student-resume-detail"),
    path("student/resumes/ai-improve/", StudentResumeAIImproveView.as_view(), name="student-resume-ai-improve"),
    path("student/resumes/ai-summary/", StudentResumeGenerateSummaryView.as_view(), name="student-resume-ai-summary"),

    # Student quizzes
    path(
        "student/exams/",
        StudentExamListView.as_view(),
        name="student-exam-list",
    ),
    path(
        "student/exams/<int:exam_id>/",
        StudentExamDetailView.as_view(),
        name="student-exam-detail",
    ),
    path(
        "student/exams/<int:exam_id>/attempts/",
        StartStudentExamAttemptView.as_view(),
        name="start-student-exam-attempt",
    ),
    path(
        "student/attempts/<int:attempt_id>/submit/",
        SubmitStudentExamAttemptView.as_view(),
        name="submit-student-exam-attempt",
    ),
    path(
        "student/attempts/<int:attempt_id>/result/",
        StudentExamResultView.as_view(),
        name="student-exam-result",
    ),
]
