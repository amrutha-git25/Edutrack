
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import DashboardOverviewSerializer
from .services.dashboard_service import get_admin_dashboard_overview

from django.utils.dateparse import parse_date

from rest_framework import status

from .services.attendance_service import get_attendance_analytics

from django.db.models import Count

from apps.learning.learning.models import Certificate

class AdminDashboardOverviewView(APIView):
    """
    GET /api/reports/admin/overview/

    Returns summary statistics for the Admin Dashboard.
    Only authenticated Django staff administrators can access it.
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        dashboard_data = get_admin_dashboard_overview()

        serializer = DashboardOverviewSerializer(data=dashboard_data)
        serializer.is_valid(raise_exception=True)

        return Response({
            "success": True,
            "message": "Admin dashboard overview retrieved successfully.",
            "data": serializer.validated_data,
        })

class AdminAttendanceAnalyticsView(APIView):
    """
    GET /api/reports/admin/attendance/

    Returns attendance analytics for staff administrators.
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        date_from_value = request.query_params.get("date_from")
        date_to_value = request.query_params.get("date_to")
        course = request.query_params.get("course", "").strip()

        date_from = None
        date_to = None

        if date_from_value:
            date_from = parse_date(date_from_value)
            if date_from is None:
                return Response(
                    {
                        "success": False,
                        "message": (
                            "Invalid date_from. Use YYYY-MM-DD."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if date_to_value:
            date_to = parse_date(date_to_value)
            if date_to is None:
                return Response(
                    {
                        "success": False,
                        "message": (
                            "Invalid date_to. Use YYYY-MM-DD."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if date_from and date_to and date_from > date_to:
            return Response(
                {
                    "success": False,
                    "message": (
                        "date_from must not be later than date_to."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        data = get_attendance_analytics(
            date_from=date_from,
            date_to=date_to,
            course=course,
        )

        return Response({
            "success": True,
            "message": (
                "Attendance analytics retrieved successfully."
            ),
            "data": data,
        })


class AdminCertificateAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        rows = (
            Certificate.objects
            .values("course_id", "course__title")
            .annotate(certificates_issued=Count("id"))
            .order_by("-certificates_issued", "course__title")
        )

        data = [
            {
                "course_id": row["course_id"],
                "course_title": row["course__title"],
                "certificates_issued": row["certificates_issued"],
            }
            for row in rows
        ]

        return Response({
            "success": True,
            "message": "Certificate analytics retrieved successfully.",
            "data": data,
        })