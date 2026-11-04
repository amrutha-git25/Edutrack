
from django.urls import path
from . import views

app_name = "learning"

urlpatterns = [
    path(
        "live-classes/",
        views.LiveClassListCreateView.as_view(),
        name="live-class-list-create",
    ),
    path(
        "live-classes/<int:pk>/",
        views.LiveClassDetailView.as_view(),
        name="live-class-detail",
    ),

    path(
        "certificates/students/",
        views.CertificateStudentListView.as_view(),
        name="certificate-students",
    ),
    path(
        "certificates/",
        views.CertificateListCreateView.as_view(),
        name="certificate-list-create",
    ),
    path(
    "certificates/<int:pk>/",
    views.StudentCertificateDetailView.as_view(),
    name="certificate-detail",
),
    path(
        "certificates/<int:pk>/download/",
        views.CertificateDownloadView.as_view(),
        name="certificate-download",
    ),
    
    # Mentor assignment management
    path(
        "mentor/assignments/",
        views.MentorAssignmentListCreateView.as_view(),
        name="mentor-assignment-list-create",
    ),
    path(
        "mentor/assignments/<int:assignment_id>/",
        views.MentorAssignmentDetailView.as_view(),
        name="mentor-assignment-detail",
    ),

    # Student Assignments
    path(
        "assignments/",
        views.StudentAssignmentListView.as_view(),
        name="assignment-list",
    ),
    path(
        "assignments/<int:assignment_id>/submission/",
        views.StudentAssignmentSubmissionView.as_view(),
        name="assignment-submission",
    ),

    # Mentor/Admin review
    path(
        "assignments/<int:assignment_id>/submissions/",
        views.AssignmentSubmissionListView.as_view(),
        name="assignment-submissions",
    ),
    path(
        "submissions/<int:submission_id>/grade/",
        views.GradeAssignmentSubmissionView.as_view(),
        name="grade-assignment-submission",
    ),

]
