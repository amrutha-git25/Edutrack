
from django.urls import path
from . import views
from .student_progress_views import StudentProgressView
urlpatterns = [
    path("", views.course_list_create, name="course-list-create"),
    path("<int:course_id>/", views.course_detail, name="course-detail"),
    path("<int:course_id>/topics/", views.course_topics, name="course-topics"),
    path("topics/<int:topic_id>/", views.topic_detail, name="topic-detail"),
    path("topics/<int:topic_id>/materials/", views.topic_materials, name="topic-materials"),
    path("materials/<int:material_id>/", views.material_detail, name="material-detail"),
    path("mentor-assignments/", views.mentor_assignments, name="mentor-assignments"),
    path(
    "mentor-assignments/<int:assignment_id>/",
    views.mentor_assignment_detail,
    name="mentor-assignment-detail",
),
    path("enrollments/", views.enrollments, name="enrollments"),
    path("enrollments/my/", views.my_enrollments, name="my-enrollments"),
    
path(
    "enrollments/bulk/",
    views.bulk_enroll_students,
    name="bulk-enroll-students",
),

    path("progress/", views.learning_progress, name="learning-progress"),
path(
    "progress/<int:progress_id>/",
    views.learning_progress_detail,
    name="learning-progress-detail"
),
path("assessments/", views.assessments, name="assessments"),
path(
    "assessments/<int:assessment_id>/",
    views.assessment_detail,
    name="assessment-detail"
),
path(
    "assessments/<int:assessment_id>/submit/",
    views.submit_assessment,
    name="submit-assessment"
),
path("assignments/", views.assignments, name="assignments"),
path(
    "assignments/<int:assignment_id>/",
    views.assignment_detail,
    name="assignment-detail"
),
path(
    "assignments/<int:assignment_id>/submit/",
    views.submit_assignment,
    name="submit-assignment"
),
path("submissions/my/", views.my_submissions, name="my-submissions"),
path(
    "materials/",
    views.learning_materials,
    name="learning-materials"
),
path(
    "materials/<int:material_id>/",
    views.learning_material_detail,
    name="learning-material-detail"
),
path(
    "files/upload/",
    views.upload_learning_file,
    name="upload-learning-file"
),
path(
    "notifications/",
    views.notifications,
    name="notifications"
),
path(
    "notifications/<int:notification_id>/read/",
    views.mark_notification_read,
    name="mark-notification-read"
),
path(
    "notifications/<int:notification_id>/",
    views.delete_notification,
    name="delete-notification"
),
path(
    "<int:course_id>/feedback/",
    views.course_feedback,
    name="course-feedback"
),
path(
    "mentors/<int:mentor_id>/feedback/",
    views.mentor_feedback,
    name="mentor-feedback"
),
path("enrollments/", views.enrollments, name="enrollments"),
path("my-enrollments/", views.my_enrollments, name="my-enrollments"),
path(
    "student/progress/",
    StudentProgressView.as_view(),
    name="student-progress",
),
path(
    "materials/<int:material_id>/preview/",
    views.material_preview,
    name="material-preview",
),
]
