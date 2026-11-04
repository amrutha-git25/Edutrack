from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.utils import timezone

from apps.learning.learning.models import Attendance


User = get_user_model()


def get_attendance_analytics(date_from=None, date_to=None, course=None):
    today = timezone.localdate()

    if date_to:
        end_date = date_to
    else:
        end_date = today

    if date_from:
        start_date = date_from
    else:
        start_date = end_date - timedelta(days=6)

    queryset = Attendance.objects.select_related(
        "student",
        "live_class",
    ).filter(
        recorded_at__date__gte=start_date,
        recorded_at__date__lte=end_date,
    )

    if course:
        queryset = queryset.filter(
            live_class__course_name__icontains=course
        )

    total = queryset.count()
    present = queryset.filter(status__iexact="present").count()
    absent = queryset.filter(status__iexact="absent").count()

    percentage = round((present / total) * 100, 2) if total else 0

    daily_trend = []

    for offset in range((end_date - start_date).days + 1):
        current_date = start_date + timedelta(days=offset)
        day_records = queryset.filter(
            recorded_at__date=current_date
        )

        day_present = day_records.filter(
            status__iexact="present"
        ).count()

        day_absent = day_records.filter(
            status__iexact="absent"
        ).count()

        daily_trend.append({
            "date": current_date.isoformat(),
            "present": day_present,
            "absent": day_absent,
            "total": day_present + day_absent,
        })

    course_breakdown = list(
        queryset.values("live_class__course_name")
        .annotate(
            total=Count("id"),
            present=Count(
                "id",
                filter=Q(status__iexact="present"),
            ),
            absent=Count(
                "id",
                filter=Q(status__iexact="absent"),
            ),
        )
        .order_by("live_class__course_name")
    )

    for item in course_breakdown:
        item["course"] = item.pop("live_class__course_name")
        item["attendance_percentage"] = (
            round(item["present"] / item["total"] * 100, 2)
            if item["total"]
            else 0
        )

    recent_records = []

    for record in queryset.order_by("-recorded_at")[:10]:
        student = record.student
        full_name = (
            student.get_full_name()
            if hasattr(student, "get_full_name")
            else str(student)
        )

        recent_records.append({
            "id": record.id,
            "student_id": student.pk,
            "student_name": full_name or str(student),
            "student_email": getattr(student, "email", ""),
            "class_id": record.live_class_id,
            "class_title": record.live_class.title,
            "course": record.live_class.course_name,
            "status": record.status,
            "joined_at": (
                record.joined_at.isoformat()
                if record.joined_at
                else None
            ),
            "recorded_at": record.recorded_at.isoformat(),
        })

    return {
        "filters": {
            "date_from": start_date.isoformat(),
            "date_to": end_date.isoformat(),
            "course": course or "",
        },
        "summary": {
            "total_records": total,
            "present": present,
            "absent": absent,
            "attendance_percentage": percentage,
        },
        "daily_trend": daily_trend,
        "course_breakdown": course_breakdown,
        "recent_records": recent_records,
    }