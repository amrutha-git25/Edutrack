from django.urls import path

from .student_course_views import (
    StudentCoursesView,
    StudentCourseTopicsView,
    StudentTopicMaterialsView,
)

urlpatterns = [
    path("", StudentCoursesView.as_view(), name="student-courses"),
    path("<int:course_id>/topics/", StudentCourseTopicsView.as_view(), name="student-course-topics"),
    path(
        "<int:course_id>/topics/<int:topic_id>/materials/",
        StudentTopicMaterialsView.as_view(),
        name="student-topic-materials",
    ),
]
