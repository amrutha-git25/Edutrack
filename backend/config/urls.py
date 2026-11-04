"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from apps.courses.courses import student_course_urls as student_course_urls
from django.conf import settings
from django.conf.urls.static import static
from apps.notifications.notifications import urls as notification_urls
from apps.chat.chat import urls as chat_urls
from apps.placements.placements import urls as placement_urls
from django.contrib import admin
from apps.payments.payments import urls as payment_urls
from apps.ai_services.ai_services import urls as ai_urls
from django.urls import path, include
from apps.courses.courses import report_urls
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)

from apps.reports.reports import urls as reports_urls
urlpatterns = [
    # Django Admin
    path("admin/", admin.site.urls),

    # EduTrack Authentication APIs
    path("api/auth/", include("apps.accounts.urls")),

    # OpenAPI Schema
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),

    # Swagger UI
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),

    # ReDoc
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
    # EduTrack User Management APIs
path("api/users/", include("apps.users.users.urls")),
path("api/courses/", include("apps.courses.courses.urls")),

path("api/reports/", include(report_urls)),
path("api/reports/admin/", include(reports_urls)),

path("api/chat/", include(chat_urls)),
path("api/placements/", include(placement_urls)),

path("api/payments/", include(payment_urls)),

path("api/learning/", include("apps.learning.learning.urls")),
path(
    "api/ai-services/",
    include("apps.ai_services.ai_services.urls"),
),
path("api/notifications/", include(notification_urls)),
path("api/student/", include("apps.student_dashboard.urls")),
path(
    "api/student/courses/",
    include(student_course_urls),
),
 path(
        "api/mentor/",
        include("apps.mentor_dashboard.urls"),
    ),
   path(
    "api/mentor/notifications/",
    include("apps.notifications.notifications.mentor_notifications_urls"),
),
]

if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT,
    )