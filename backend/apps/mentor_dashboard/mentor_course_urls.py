
from django.urls import path

from .mentor_course_views import (
    MentorCourseListAPIView,
    MentorCourseDetailAPIView,
)

urlpatterns = [
    path(
        "courses/",
        MentorCourseListAPIView.as_view(),
        name="mentor-courses",
    ),
    path(
        "courses/<int:course_id>/",
        MentorCourseDetailAPIView.as_view(),
        name="mentor-course-detail",
    ),
]
