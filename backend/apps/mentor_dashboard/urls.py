from django.urls import path
from .views import (
    MentorDashboardView,
    MentorSettingsView,
    MentorActivitiesView,

)
from .mentor_messages_views import (
    MentorMessageContactsView,
    MentorConversationsView,
    MentorConversationMessagesView,
    MentorConversationReadView,
)
from .mentor_profile_views import (
    MentorProfileView,
    MentorProfilePictureView,
    MentorChangePasswordView,
)
from .mentor_notifications_views import (
    MentorNotificationListView,
    MentorNotificationDetailView,
    MentorNotificationReadView,
    MentorMarkAllNotificationsReadView,
)
from .attendance_views import (
    MentorAttendanceListView,
    MentorClassAttendanceView,
)
from .students_views import (
    MentorStudentsView,
    MentorStudentDetailView,
)
from .live_class_views import (
    MentorLiveClassListCreateView,
    MentorLiveClassDetailView,
    MentorLiveClassStartView,
)

from .ai_exam_views import AIExamGenerateView
from .exam_views import (
    MentorExamListCreateView,
    MentorExamDetailView,
    MentorExamAvailabilityView,
    MentorExamResultsView,
)
from .mentor_course_views import (
    MentorCourseListAPIView,
    MentorCourseDetailAPIView,
)
from .topic_material_views import (
    MentorAssignedCoursesView,
    MentorTopicListCreateView,
    MentorTopicDetailView,
    MentorTopicMaterialListCreateView,
    MentorMaterialDetailView,
    MentorTopicMaterialUploadUrlView,
)
app_name = "mentor_dashboard"

urlpatterns = [
    path(
        "dashboard/",
        MentorDashboardView.as_view(),
        name="dashboard",
    ),
    path(
        "settings/",
        MentorSettingsView.as_view(),
        name="settings",
    ),
    path(
        "activities/",
        MentorActivitiesView.as_view(),
        name="activities",
    ),
    path("courses/", MentorCourseListAPIView.as_view(), name="mentor-courses"),
path(
    "courses/<int:course_id>/",
    MentorCourseDetailAPIView.as_view(),
    name="mentor-course-detail",
),
 path(
        "materials/courses/",
        MentorAssignedCoursesView.as_view(),
        name="mentor-material-courses",
    ),
    path(
        "materials/courses/<int:course_id>/topics/",
        MentorTopicListCreateView.as_view(),
        name="mentor-course-topics",
    ),
    path(
        "materials/topics/<int:topic_id>/",
        MentorTopicDetailView.as_view(),
        name="mentor-topic-detail",
    ),
    path(
        "materials/topics/<int:topic_id>/materials/",
        MentorTopicMaterialListCreateView.as_view(),
        name="mentor-topic-materials",
    ),
    path(
        "materials/materials/<int:material_id>/",
        MentorMaterialDetailView.as_view(),
        name="mentor-material-detail",
    ),
    path("exams/", MentorExamListCreateView.as_view(), name="mentor-exams"),
path("exams/<int:exam_id>/", MentorExamDetailView.as_view(), name="mentor-exam-detail"),
path("exams/<int:exam_id>/availability/", MentorExamAvailabilityView.as_view(), name="mentor-exam-availability"),
path("exams/<int:exam_id>/results/", MentorExamResultsView.as_view(), name="mentor-exam-results"),
path(
    "exams/ai-generate/",
    AIExamGenerateView.as_view(),
    name="mentor-ai-exam-generate",
),

path(
    "live-classes/",
    MentorLiveClassListCreateView.as_view(),
    name="mentor-live-classes",
),
path(
    "live-classes/<int:class_id>/",
    MentorLiveClassDetailView.as_view(),
    name="mentor-live-class-detail",
),
path(
    "live-classes/<int:class_id>/start/",
    MentorLiveClassStartView.as_view(),
    name="mentor-live-class-start",
),

path(
    "attendance/",
    MentorAttendanceListView.as_view(),
    name="mentor-attendance",
),
path(
    "attendance/<int:class_id>/",
    MentorClassAttendanceView.as_view(),
    name="mentor-class-attendance",
),
path(
    "students/",
    MentorStudentsView.as_view(),
    name="mentor-students",
),
path(
    "students/<int:student_id>/",
    MentorStudentDetailView.as_view(),
    name="mentor-student-detail",
),
path(
    "messages/contacts/",
    MentorMessageContactsView.as_view(),
    name="mentor-message-contacts",
),
path(
    "messages/conversations/",
    MentorConversationsView.as_view(),
    name="mentor-conversations",
),
path(
    "messages/conversations/<int:conversation_id>/messages/",
    MentorConversationMessagesView.as_view(),
    name="mentor-conversation-messages",
),
path(
    "messages/conversations/<int:conversation_id>/read/",
    MentorConversationReadView.as_view(),
    name="mentor-conversation-read",
),
path(
    "notifications/",
    MentorNotificationListView.as_view(),
    name="mentor-notifications",
),
path(
    "notifications/<int:notification_id>/",
    MentorNotificationDetailView.as_view(),
    name="mentor-notification-detail",
),
path(
    "notifications/<int:notification_id>/read/",
    MentorNotificationReadView.as_view(),
    name="mentor-notification-read",
),
path(
    "notifications/read-all/",
    MentorMarkAllNotificationsReadView.as_view(),
    name="mentor-notifications-read-all",
),
path(
    "profile/",
    MentorProfileView.as_view(),
    name="mentor-profile",
),
path(
    "profile/picture/",
    MentorProfilePictureView.as_view(),
    name="mentor-profile-picture",
),
path(
    "profile/password/",
    MentorChangePasswordView.as_view(),
    name="mentor-change-password",
),
path(
    "topics/<int:topic_id>/materials/upload-url/",
    MentorTopicMaterialUploadUrlView.as_view(),
    name="mentor-topic-material-upload-url",
),
]