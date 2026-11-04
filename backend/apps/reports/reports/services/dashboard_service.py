
from dateutil.relativedelta import relativedelta
from apps.reports.reports.models import ActivityLog
from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.users.users.models import Student
from apps.courses.courses.models import Course, Enrollment


User = get_user_model()


def get_admin_dashboard_overview():
    now = timezone.now()

    month_start = now.replace(
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )

    # --------------------------------------------------
    # 1. Total students and new students this month
    # --------------------------------------------------
    students = Student.objects.select_related("user")

    student_count = students.count()

    new_this_month = students.filter(
        joined_at__gte=month_start,
        joined_at__lte=now,
    ).count()

    # --------------------------------------------------
    # 2. Active courses
    # --------------------------------------------------
    active_courses = Course.objects.filter(
        status=Course.Status.PUBLISHED
    ).count()

    # --------------------------------------------------
    # 3. Total mentors
    # --------------------------------------------------
    mentor_count = User.objects.filter(
        groups__name__iexact="MENTOR"
    ).distinct().count()

    # --------------------------------------------------
    # 4. Student enrollment trend for the last 6 months
    # --------------------------------------------------
    first_month = (
        month_start - relativedelta(months=5)
    )

    monthly_counts = {
        item["month"]: item["students"]
        for item in (
            Enrollment.objects.filter(
                enrolled_at__gte=first_month,
                enrolled_at__lte=now,
            )
            .annotate(month=TruncMonth("enrolled_at"))
            .values("month")
            .annotate(
                students=Count("student", distinct=True)
            )
        )
    }

    enrollment_trend = []

    for offset in range(6):
        current_month = first_month + relativedelta(
            months=offset
        )

        enrollment_trend.append({
            "month": current_month.strftime("%b"),
            "students": monthly_counts.get(
                current_month, 0
            ),
        })

    # --------------------------------------------------
    # 5. Students by course
    # Count distinct students with active enrollments.
    # --------------------------------------------------
    students_by_course = list(
        Course.objects.annotate(
            students=Count(
                "enrollments__student",
                filter=Q(
                    enrollments__status=Enrollment.Status.ACTIVE
                ),
                distinct=True,
            )
        )
        .values("id", "title", "students")
        .order_by("title")
    )

    students_by_course = [
        {
            "id": item["id"],
            "name": item["title"],
            "students": item["students"],
        }
        for item in students_by_course
    ]

    # --------------------------------------------------
    # 6. Five most recent actual course enrollments
    # --------------------------------------------------
    recent_enrollments = []

    enrollments = (
        Enrollment.objects.select_related(
            "student__user",
            "course",
        )
        .order_by("-enrolled_at")[:5]
    )

    for enrollment in enrollments:
        user = enrollment.student.user

        recent_enrollments.append({
            "id": enrollment.id,
            "name": (
                user.get_full_name() or user.username
            ),
            "email": user.email,
            "date": enrollment.enrolled_at.isoformat(),
            "course": enrollment.course.title,
            "status": enrollment.get_status_display(),
        })
    recent_activity = [
    {
        "id": item.id,
        "title": item.action.replace("_", " ").title(),
        "description": item.description,
        "time": item.created_at.isoformat(),
    }
    for item in ActivityLog.objects.select_related(
        "actor"
    ).order_by("-created_at")[:10]
]
    # --------------------------------------------------
    # 7. Dashboard response
    # --------------------------------------------------
    return {
        "students": {
            "total": student_count,
            "new_this_month": new_this_month,
        },
        "courses": {
            "active": active_courses,
        },
        "mentors": {
            "total": mentor_count,
        },
        "revenue": {
            "monthly": "0.00",
            "currency": "INR",
        },
        "enrollment_trend": enrollment_trend,
        "students_by_course": students_by_course,
        "recent_enrollments": recent_enrollments,
        "recent_activity": recent_activity,
        "data_status": {
            "students": "available",
            "mentors": "available",
            "courses": "available",
            "revenue": "pending_model_integration",
            "enrollments": "available",
            "activity": "available",
        },
    }
