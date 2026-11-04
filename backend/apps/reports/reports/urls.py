from django.urls import path

from .views import (
    AdminDashboardOverviewView,
    AdminAttendanceAnalyticsView,
    AdminCertificateAnalyticsView
)

urlpatterns = [
    path(
        "overview/",
        AdminDashboardOverviewView.as_view(),
        name="admin-dashboard-overview",
    ),

path(
    "attendance/",
    AdminAttendanceAnalyticsView.as_view(),
    name="admin-attendance-analytics",
),

    path(
    "certificates/",
    AdminCertificateAnalyticsView.as_view(),
    name="admin-certificate-analytics",
    ),
]