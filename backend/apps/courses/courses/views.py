from django.shortcuts import get_object_or_404
from django.db import IntegrityError, transaction
from django.db.models import Q

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import status
from rest_framework.exceptions import ValidationError

from apps.users.users.models import Student

from .models import (
    Course,
    Enrollment,
    MentorAssignment,
    Topic,
    Material,
)

from .serializers import (
    CourseSerializer,
    EnrollmentSerializer,
    MentorAssignmentSerializer,
    TopicSerializer,
    MaterialSerializer,
)

import mimetypes
import shutil
import subprocess
import tempfile

import re
from django.db import connection
from django.http import HttpResponse

from pathlib import Path
from io import BytesIO

from django.http import FileResponse

# ============================================================
# PERMISSION HELPERS
# ============================================================

def _is_admin(user):
    return bool(user.is_staff or user.is_superuser)


def _mentor_can_manage_course(user, course):
    if _is_admin(user):
        return True

    if course.mentor_id == user.id:
        return True

    return MentorAssignment.objects.filter(
        course_id=course.pk,
        mentor__user_id=user.id
    ).exists()


def _user_can_view_course(user, course):
    if _mentor_can_manage_course(user, course):
        return True

    if course.status != Course.Status.PUBLISHED or course.is_archived:
        return False

    is_enrolled = Enrollment.objects.filter(
        course=course,
        student__user=user,
        status=Enrollment.Status.ACTIVE
    ).exists()

    is_assigned = MentorAssignment.objects.filter(
        course=course,
        student__user=user
    ).exists()

    return is_enrolled or is_assigned


# ============================================================
# 1. LIST COURSES / CREATE COURSE
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def course_list_create(request):

    if request.method == "GET":

        courses = Course.objects.filter(
            is_archived=False
        ).order_by("-created_at")

        if not _is_admin(request.user):

            mentor_courses = courses.filter(
                Q(mentor=request.user) |
                Q(student_mentor_assignments__mentor__user=request.user)
            ).distinct()

            if mentor_courses.exists():
                courses = mentor_courses
            else:
                courses = courses.filter(
                    status=Course.Status.PUBLISHED
                )

        serializer = CourseSerializer(
            courses,
            many=True,
            context={"request": request},
        )

        return Response(
            serializer.data,
            status=status.HTTP_200_OK
        )

    if not request.user.is_superuser:
        return Response(
            {
                "detail": "Only the superuser admin can create courses."
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = CourseSerializer(
        data=request.data,
        context={"request": request},
    )

    if serializer.is_valid():
        course = serializer.save()

        return Response(
            CourseSerializer(
                course,
                context={"request": request}
            ).data,
            status=status.HTTP_201_CREATED,
        )

    return Response(
        serializer.errors,
        status=status.HTTP_400_BAD_REQUEST
    )


# ============================================================
# 2. RETRIEVE / UPDATE / ARCHIVE COURSE
# ============================================================

@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def course_detail(request, course_id):

    course = get_object_or_404(
        Course,
        pk=course_id,
        is_archived=False
    )

    if request.method == "GET":

        if not _user_can_view_course(request.user, course):
            return Response(
                {"detail": "Course not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = CourseSerializer(
            course,
            context={"request": request},
        )

        return Response(
            serializer.data,
            status=status.HTTP_200_OK
        )

    if not request.user.is_superuser:
        return Response(
            {
                "detail": "Only the superuser admin can modify courses."
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    if request.method == "DELETE":

        course.is_archived = True
        course.save(update_fields=["is_archived"])

        return Response(
            {
                "success": True,
                "message": "Course archived successfully.",
                "course_id": course.pk,
            },
            status=status.HTTP_200_OK,
        )

    serializer = CourseSerializer(
        course,
        data=request.data,
        partial=(request.method == "PATCH"),
        context={"request": request},
    )

    serializer.is_valid(raise_exception=True)
    course = serializer.save()

    return Response(
        CourseSerializer(
            course,
            context={"request": request}
        ).data,
        status=status.HTTP_200_OK,
    )


# ============================================================
# 3. LIST TOPICS / CREATE TOPIC
# GET  /api/courses/<course_id>/topics/
# POST /api/courses/<course_id>/topics/
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def course_topics(request, course_id):

    course = get_object_or_404(
        Course,
        pk=course_id,
        is_archived=False
    )

    if request.method == "GET":

        if not _user_can_view_course(request.user, course):
            return Response(
                {
                    "success": False,
                    "detail": "You do not have access to this course."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        topics = Topic.objects.filter(
            course=course
        ).prefetch_related("materials")

        serializer = TopicSerializer(
            topics,
            many=True,
            context={"request": request}
        )

        return Response(
            {
                "success": True,
                "count": topics.count(),
                "topics": serializer.data
            },
            status=status.HTTP_200_OK
        )

    if not _mentor_can_manage_course(request.user, course):
        return Response(
            {
                "success": False,
                "detail": "Only the assigned mentor or an admin can create topics."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    serializer = TopicSerializer(
        data=request.data,
        context={"request": request}
    )

    serializer.is_valid(raise_exception=True)

    topic = serializer.save(course=course)

    return Response(
        {
            "success": True,
            "message": "Topic created successfully.",
            "topic": TopicSerializer(
                topic,
                context={"request": request}
            ).data
        },
        status=status.HTTP_201_CREATED
    )


# ============================================================
# 4. RETRIEVE / UPDATE / DELETE TOPIC
# ============================================================

@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def topic_detail(request, topic_id):

    topic = get_object_or_404(
        Topic.objects.select_related("course").prefetch_related("materials"),
        pk=topic_id
    )

    can_manage = _mentor_can_manage_course(
        request.user,
        topic.course
    )

    if request.method == "GET":

        if not _user_can_view_course(request.user, topic.course):
            return Response(
                {
                    "success": False,
                    "detail": "You do not have access to this topic."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        return Response(
            {
                "success": True,
                "topic": TopicSerializer(
                    topic,
                    context={"request": request}
                ).data
            },
            status=status.HTTP_200_OK
        )

    if not can_manage:
        return Response(
            {
                "success": False,
                "detail": "Only the assigned mentor or an admin can modify this topic."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    if request.method == "DELETE":

        topic.delete()

        return Response(
            {
                "success": True,
                "message": "Topic deleted successfully."
            },
            status=status.HTTP_200_OK
        )

    serializer = TopicSerializer(
        topic,
        data=request.data,
        partial=(request.method == "PATCH"),
        context={"request": request}
    )

    serializer.is_valid(raise_exception=True)
    topic = serializer.save()

    return Response(
        {
            "success": True,
            "message": "Topic updated successfully.",
            "topic": TopicSerializer(
                topic,
                context={"request": request}
            ).data
        },
        status=status.HTTP_200_OK
    )


# ============================================================
# 5. LIST MATERIALS / UPLOAD MATERIAL
# GET  /api/courses/topics/<topic_id>/materials/
# POST /api/courses/topics/<topic_id>/materials/
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def topic_materials(request, topic_id):

    topic = get_object_or_404(
        Topic.objects.select_related("course"),
        pk=topic_id
    )

    can_manage = _mentor_can_manage_course(
        request.user,
        topic.course
    )

    if request.method == "GET":

        if not _user_can_view_course(request.user, topic.course):
            return Response(
                {
                    "success": False,
                    "detail": "You do not have access to these materials."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        materials = Material.objects.filter(
            topic=topic
        )

        if not can_manage:
            materials = materials.filter(
                is_published=True
            )

        serializer = MaterialSerializer(
            materials,
            many=True,
            context={"request": request}
        )

        return Response(
            {
                "success": True,
                "count": materials.count(),
                "materials": serializer.data
            },
            status=status.HTTP_200_OK
        )

    if not can_manage:
        return Response(
            {
                "success": False,
                "detail": "Only the assigned mentor or an admin can upload materials."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    serializer = MaterialSerializer(
        data=request.data,
        context={"request": request}
    )

    serializer.is_valid(raise_exception=True)

    material = serializer.save(
        topic=topic
    )

    return Response(
        {
            "success": True,
            "message": "Learning material uploaded successfully.",
            "material": MaterialSerializer(
                material,
                context={"request": request}
            ).data
        },
        status=status.HTTP_201_CREATED
    )


# ============================================================
# 6. RETRIEVE / UPDATE / DELETE MATERIAL
# ============================================================

@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def material_detail(request, material_id):

    material = get_object_or_404(
        Material.objects.select_related("topic__course"),
        pk=material_id
    )

    course = material.topic.course

    can_manage = _mentor_can_manage_course(
        request.user,
        course
    )

    if request.method == "GET":

        if not _user_can_view_course(request.user, course):
            return Response(
                {
                    "success": False,
                    "detail": "You do not have access to this material."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        if not can_manage and not material.is_published:
            return Response(
                {
                    "success": False,
                    "detail": "Material not found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        return Response(
            {
                "success": True,
                "material": MaterialSerializer(
                    material,
                    context={"request": request}
                ).data
            },
            status=status.HTTP_200_OK
        )

    if not can_manage:
        return Response(
            {
                "success": False,
                "detail": "Only the assigned mentor or an admin can modify materials."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    if request.method == "DELETE":

        if material.file:
            material.file.delete(save=False)

        material.delete()

        return Response(
            {
                "success": True,
                "message": "Learning material deleted successfully."
            },
            status=status.HTTP_200_OK
        )

    old_file = material.file

    serializer = MaterialSerializer(
        material,
        data=request.data,
        partial=(request.method == "PATCH"),
        context={"request": request}
    )

    serializer.is_valid(raise_exception=True)

    updated_material = serializer.save()

    if (
        "file" in request.FILES
        and old_file
        and old_file.name != updated_material.file.name
    ):
        old_file.delete(save=False)

    return Response(
        {
            "success": True,
            "message": "Learning material updated successfully.",
            "material": MaterialSerializer(
                updated_material,
                context={"request": request}
            ).data
        },
        status=status.HTTP_200_OK
    )

@api_view(["GET", "HEAD"])
@permission_classes([IsAuthenticated])
def material_binary(request, material_id):
    material = get_object_or_404(
        Material.objects.select_related("topic__course"),
        pk=material_id,
    )

    course = material.topic.course

    can_manage = _mentor_can_manage_course(
        request.user,
        course,
    )

    if not _user_can_view_course(request.user, course):
        return Response(
            {"detail": "You do not have permission to view this material."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if not can_manage and not material.is_published:
        return Response(
            {"detail": "Material not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if material.binary_content is None:
        return Response(
            {"detail": "This material is not stored in the database."},
            status=status.HTTP_404_NOT_FOUND,
        )

    table = connection.ops.quote_name(Material._meta.db_table)
    column = connection.ops.quote_name("binary_content")
    pk_column = connection.ops.quote_name(Material._meta.pk.column)

    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT octet_length({column}) FROM {table} "
            f"WHERE {pk_column} = %s",
            [material_id],
        )
        result = cursor.fetchone()

    if not result or result[0] is None:
        return Response(
            {"detail": "Video data not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    total_size = result[0]
    start = 0
    end = total_size - 1
    status_code = 200

    range_header = request.headers.get("Range")

    if range_header:
        match = re.match(r"bytes=(\d*)-(\d*)$", range_header.strip())

        if not match:
            response = HttpResponse(status=416)
            response["Content-Range"] = f"bytes */{total_size}"
            return response

        first, last = match.groups()

        if first:
            start = int(first)
            end = int(last) if last else total_size - 1
        else:
            suffix_length = int(last)
            start = max(total_size - suffix_length, 0)
            end = total_size - 1

        if start >= total_size or end < start:
            response = HttpResponse(status=416)
            response["Content-Range"] = f"bytes */{total_size}"
            return response

        end = min(end, total_size - 1)
        status_code = 206

    length = end - start + 1

    with connection.cursor() as cursor:
        cursor.execute(
            f"SELECT substring({column} from %s for %s) "
            f"FROM {table} WHERE {pk_column} = %s",
            [start + 1, length, material_id],
        )
        content = cursor.fetchone()[0]

    content_type = (
        material.binary_content_type
        or mimetypes.guess_type(material.binary_filename)[0]
        or "application/octet-stream"
    )

    response = HttpResponse(
        b"" if request.method == "HEAD" else content,
        content_type=content_type,
        status=status_code,
    )

    response["Accept-Ranges"] = "bytes"
    response["Content-Length"] = str(length)
    response["Content-Disposition"] = "inline"
    response["X-Content-Type-Options"] = "nosniff"

    if status_code == 206:
        response["Content-Range"] = (
            f"bytes {start}-{end}/{total_size}"
        )

    return response
# ============================================================
# 7. LIST MENTOR ASSIGNMENTS / CREATE ASSIGNMENT
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def mentor_assignments(request):

    if request.method == "GET":

        queryset = MentorAssignment.objects.select_related(
            "student__user",
            "course",
            "mentor__user",
            "assigned_by",
        ).all()

        serializer = MentorAssignmentSerializer(
            queryset,
            many=True,
        )

        return Response({
            "success": True,
            "count": queryset.count(),
            "assignments": serializer.data,
        })

    serializer = MentorAssignmentSerializer(
        data=request.data
    )

    serializer.is_valid(raise_exception=True)

    try:
        with transaction.atomic():
            assignment = serializer.save(
                assigned_by=request.user,
            )

    except IntegrityError:
        return Response({
            "success": False,
            "message": (
                "This student already has an assignment "
                "for this subject. Edit the existing assignment instead."
            ),
        }, status=status.HTTP_409_CONFLICT)

    return Response({
        "success": True,
        "message": "Mentor assigned to student successfully.",
        "assignment": MentorAssignmentSerializer(assignment).data,
    }, status=status.HTTP_201_CREATED)


# ============================================================
# 8. RETRIEVE / UPDATE / DELETE MENTOR ASSIGNMENT
# ============================================================

@api_view(["GET", "PATCH", "PUT", "DELETE"])
@permission_classes([IsAdminUser])
def mentor_assignment_detail(request, assignment_id):

    assignment = get_object_or_404(
        MentorAssignment.objects.select_related(
            "student__user",
            "course",
            "mentor__user",
            "assigned_by",
        ),
        pk=assignment_id,
    )

    if request.method == "GET":

        return Response({
            "success": True,
            "assignment": MentorAssignmentSerializer(
                assignment
            ).data,
        })

    if request.method == "DELETE":

        assignment.delete()

        return Response(
            status=status.HTTP_204_NO_CONTENT
        )

    serializer = MentorAssignmentSerializer(
        assignment,
        data=request.data,
        partial=(request.method == "PATCH"),
    )

    serializer.is_valid(raise_exception=True)

    try:
        with transaction.atomic():
            updated_assignment = serializer.save()

    except IntegrityError:
        return Response({
            "success": False,
            "message": (
                "This student already has an assignment "
                "for the selected subject."
            ),
        }, status=status.HTTP_409_CONFLICT)

    return Response({
        "success": True,
        "message": "Mentor assignment updated successfully.",
        "assignment": MentorAssignmentSerializer(
            updated_assignment
        ).data,
    })


# ============================================================
# 9. ENROLLMENTS
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def enrollments(request):

    if request.method == "GET":

        queryset = Enrollment.objects.select_related(
            "student__user",
            "course"
        )

        if request.user.is_staff:
            queryset = queryset.all()
        else:
            queryset = queryset.filter(
                student__user=request.user
            )

        serializer = EnrollmentSerializer(
            queryset,
            many=True
        )

        return Response({
            "success": True,
            "count": len(serializer.data),
            "enrollments": serializer.data,
        })

    course_id = request.data.get("course_id")
    student_id = request.data.get("student_id")

    if not course_id:
        return Response(
            {"message": "course_id is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    course = get_object_or_404(
        Course,
        pk=course_id,
        status=Course.Status.PUBLISHED,
        is_archived=False,
    )

    if request.user.is_staff:

        if not student_id:
            return Response(
                {
                    "message": "student_id is required for admin enrollment."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            student = Student.objects.get(
                pk=student_id
            )

        except (Student.DoesNotExist, ValueError, TypeError):
            return Response(
                {
                    "success": False,
                    "message": f"Student with ID {student_id} does not exist.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

    else:

        if student_id:
            return Response(
                {
                    "message": "You can enroll only your own account."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            student = Student.objects.get(
                user=request.user
            )

        except Student.DoesNotExist:
            return Response(
                {
                    "message": "No student profile exists for this account."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    if not student.is_active:
        return Response(
            {
                "message": "This student account is inactive."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():

            enrollment, created = Enrollment.objects.get_or_create(
                student=student,
                course=course,
                defaults={
                    "status": Enrollment.Status.ACTIVE
                }
            )

    except IntegrityError:
        return Response(
            {
                "message": "Could not create the enrollment."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not created:
        return Response(
            {
                "message": "This student is already enrolled in this course."
            },
            status=status.HTTP_409_CONFLICT,
        )

    return Response({
        "success": True,
        "message": "Student enrolled successfully.",
        "enrollment": EnrollmentSerializer(enrollment).data,
    }, status=status.HTTP_201_CREATED)


# ============================================================
# 10. MY ENROLLMENTS
# ============================================================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_enrollments(request):

    queryset = Enrollment.objects.select_related(
        "student__user",
        "course"
    ).filter(
        student__user=request.user
    )

    serializer = EnrollmentSerializer(
        queryset,
        many=True
    )

    return Response({
        "success": True,
        "count": len(serializer.data),
        "enrollments": serializer.data,
    })


# ============================================================
# 11. BULK ENROLL STUDENTS
# ============================================================

@api_view(["POST"])
@permission_classes([IsAdminUser])
def bulk_enroll_students(request):

    course_id = request.data.get("course_id")

    if not course_id:
        return Response(
            {
                "success": False,
                "message": "course_id is required.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        course = Course.objects.get(
            pk=course_id,
            status=Course.Status.PUBLISHED,
            is_archived=False,
        )

    except (Course.DoesNotExist, ValueError, TypeError):
        return Response(
            {
                "success": False,
                "message": "Published course not found.",
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    students = Student.objects.filter(
        is_active=True,
        user__is_active=True,
    ).order_by("id")

    if not students.exists():
        return Response({
            "success": True,
            "message": "No active students are available.",
            "course_id": course.id,
            "course_title": course.title,
            "total_active_students": 0,
            "enrolled_count": 0,
            "skipped_count": 0,
        })

    student_ids = list(
        students.values_list("id", flat=True)
    )

    with transaction.atomic():

        existing_ids = set(
            Enrollment.objects.filter(
                course=course,
                student_id__in=student_ids,
            ).values_list("student_id", flat=True)
        )

        new_enrollments = [
            Enrollment(
                student_id=student_id,
                course=course,
                status=Enrollment.Status.ACTIVE,
            )
            for student_id in student_ids
            if student_id not in existing_ids
        ]

        Enrollment.objects.bulk_create(
            new_enrollments,
            ignore_conflicts=True,
        )

        final_ids = set(
            Enrollment.objects.filter(
                course=course,
                student_id__in=student_ids,
            ).values_list("student_id", flat=True)
        )

    enrolled_count = len(final_ids - existing_ids)
    skipped_count = len(student_ids) - enrolled_count

    return Response({
        "success": True,
        "message": "Bulk enrollment completed.",
        "course_id": course.id,
        "course_title": course.title,
        "total_active_students": len(student_ids),
        "enrolled_count": enrolled_count,
        "skipped_count": skipped_count,
    }, status=status.HTTP_200_OK)


# ============================================================
# 12. LEARNING PROGRESS API
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def learning_progress(request):

    if request.method == "GET":

        return Response({
            "message": "Learning progress API is ready.",
            "user_id": request.user.id,
            "progress": []
        })

    return Response(
        {
            "message": "Saving learning progress requires database integration.",
            "received_data": request.data
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["GET", "PATCH", "PUT"])
@permission_classes([IsAuthenticated])
def learning_progress_detail(request, progress_id):

    return Response(
        {
            "message": "Learning progress detail API is ready for database integration.",
            "progress_id": progress_id
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


# ============================================================
# 13. ASSESSMENTS AND QUIZZES API
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def assessments(request):

    if request.method == "GET":

        return Response({
            "message": "Assessments API is ready.",
            "assessments": []
        })

    if not (
        request.user.is_staff
        or getattr(request.user, "is_mentor", False)
    ):
        return Response(
            {
                "error": "Only authorized mentors or admins can create assessments."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    return Response(
        {
            "message": "Creating assessments requires database integration.",
            "received_data": request.data
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def assessment_detail(request, assessment_id):

    return Response(
        {
            "message": "Assessment detail API is scaffolded.",
            "assessment_id": assessment_id,
            "detail": "Database integration is pending."
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_assessment(request, assessment_id):

    return Response(
        {
            "message": "Assessment submission API is scaffolded.",
            "assessment_id": assessment_id,
            "detail": "Answer validation and saving are pending.",
            "received_data": request.data
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


# ============================================================
# 14. ASSIGNMENTS AND SUBMISSIONS API
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def assignments(request):

    if request.method == "GET":

        return Response({
            "message": "Assignments API is ready.",
            "assignments": []
        })

    if not request.user.is_staff:
        return Response(
            {
                "error": "Only authorized mentors or admins can create assignments."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    return Response(
        {
            "message": "Assignment creation requires database integration.",
            "received_data": request.data
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def assignment_detail(request, assignment_id):

    return Response(
        {
            "message": "Assignment detail API is scaffolded.",
            "assignment_id": assignment_id,
            "detail": "Database integration is pending."
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_assignment(request, assignment_id):

    return Response(
        {
            "message": "Assignment submission API is scaffolded.",
            "assignment_id": assignment_id,
            "detail": "Submission storage and validation are pending.",
            "received_data": request.data
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_submissions(request):

    return Response({
        "message": "My submissions API is ready.",
        "user_id": request.user.id,
        "submissions": []
    })


# ============================================================
# 15. LEARNING MATERIALS AND FILE MANAGEMENT API
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def learning_materials(request):

    if request.method == "GET":

        return Response({
            "message": "Learning materials API is ready.",
            "materials": []
        })

    if not request.user.is_staff:
        return Response(
            {
                "error": "Only authorized mentors or admins can add materials."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    return Response(
        {
            "message": "Saving material metadata requires database integration.",
            "received_data": request.data
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def learning_material_detail(request, material_id):

    return Response(
        {
            "message": "Learning material detail API is scaffolded.",
            "material_id": material_id,
            "detail": "Database integration is pending."
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def upload_learning_file(request):

    if not request.user.is_staff:
        return Response(
            {
                "error": "Only authorized mentors or admins can upload learning files."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    uploaded_file = request.FILES.get("file")

    if not uploaded_file:
        return Response(
            {
                "error": "Please provide a file using the 'file' field."
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    return Response(
        {
            "message": "File received, but permanent storage is not configured.",
            "filename": uploaded_file.name,
            "size_bytes": uploaded_file.size,
            "content_type": uploaded_file.content_type
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


# ============================================================
# 16. NOTIFICATIONS MANAGEMENT API
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def notifications(request):

    if request.method == "GET":

        return Response({
            "message": "Notifications API is ready.",
            "user_id": request.user.id,
            "notifications": []
        })

    if not request.user.is_staff:
        return Response(
            {
                "error": "Only authorized mentors or admins can create announcements."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    return Response(
        {
            "message": "Creating notifications requires database integration.",
            "received_data": request.data
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def mark_notification_read(request, notification_id):

    return Response(
        {
            "message": "Mark-as-read API is scaffolded.",
            "notification_id": notification_id,
            "detail": "Database integration is pending."
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_notification(request, notification_id):

    return Response(
        {
            "message": "Delete notification API is scaffolded.",
            "notification_id": notification_id,
            "detail": "Database integration is pending."
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


# ============================================================
# 17. REPORTS AND ANALYTICS API
# ============================================================

@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def dashboard_report(request):

    return Response({
        "message": "Dashboard report API is ready.",
        "summary": {
            "total_students": 0,
            "total_mentors": 0,
            "total_courses": 0,
            "total_assessments": 0,
            "total_assignments": 0
        },
        "note": "Live statistics require database integration."
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def course_report(request):

    return Response({
        "message": "Course report API is ready.",
        "courses": [],
        "note": "Course statistics require database integration."
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def student_progress_report(request):

    return Response({
        "message": "Student progress report API is ready.",
        "user_id": request.user.id,
        "progress": [],
        "note": "Progress data requires database integration."
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def user_report(request):

    return Response({
        "message": "User report API is ready.",
        "users": [],
        "note": "User statistics require database integration."
    })


# ============================================================
# 18. FEEDBACK AND RATINGS API
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def course_feedback(request, course_id):

    if request.method == "GET":

        return Response({
            "message": "Course feedback API is ready.",
            "course_id": course_id,
            "feedback": []
        })

    rating = request.data.get("rating")
    comment = request.data.get("comment", "")

    if (
        not isinstance(rating, int)
        or isinstance(rating, bool)
        or not 1 <= rating <= 5
    ):
        return Response(
            {
                "error": "Rating must be an integer between 1 and 5."
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    return Response(
        {
            "message": "Feedback validation successful; storage is pending.",
            "course_id": course_id,
            "user_id": request.user.id,
            "rating": rating,
            "comment": comment
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def mentor_feedback(request, mentor_id):

    if request.method == "GET":

        return Response({
            "message": "Mentor feedback API is ready.",
            "mentor_id": mentor_id,
            "feedback": []
        })

    rating = request.data.get("rating")
    comment = request.data.get("comment", "")

    if (
        not isinstance(rating, int)
        or isinstance(rating, bool)
        or not 1 <= rating <= 5
    ):
        return Response(
            {
                "error": "Rating must be an integer between 1 and 5."
            },
            status=status.HTTP_400_BAD_REQUEST
        )

    return Response(
        {
            "message": "Feedback validation successful; storage is pending.",
            "mentor_id": mentor_id,
            "user_id": request.user.id,
            "rating": rating,
            "comment": comment
        },
        status=status.HTTP_501_NOT_IMPLEMENTED
    )


# ============================================================
# 19. ENROLLMENTS - DATABASE IMPLEMENTATION
# ============================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def enrollments(request):

    if request.method == "GET":

        queryset = Enrollment.objects.select_related(
            "student__user",
            "course"
        )

        if request.user.is_staff:
            queryset = queryset.all()
        else:
            queryset = queryset.filter(
                student__user=request.user
            )

        serializer = EnrollmentSerializer(
            queryset,
            many=True
        )

        return Response({
            "success": True,
            "count": len(serializer.data),
            "enrollments": serializer.data,
        })

    course_id = request.data.get("course_id")
    student_id = request.data.get("student_id")

    if not course_id:
        return Response(
            {
                "message": "course_id is required."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    course = get_object_or_404(
        Course,
        pk=course_id,
        status=Course.Status.PUBLISHED,
        is_archived=False,
    )

    if request.user.is_staff:

        if not student_id:
            return Response(
                {
                    "message": "student_id is required for admin enrollment."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            student = Student.objects.get(
                pk=student_id
            )

        except (Student.DoesNotExist, ValueError, TypeError):
            return Response(
                {
                    "success": False,
                    "message": f"Student with ID {student_id} does not exist.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

    else:

        if student_id:
            return Response(
                {
                    "message": "You can enroll only your own account."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            student = Student.objects.get(
                user=request.user
            )

        except Student.DoesNotExist:
            return Response(
                {
                    "message": "No student profile exists for this account."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    if not student.is_active:
        return Response(
            {
                "message": "This student account is inactive."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():

            enrollment, created = Enrollment.objects.get_or_create(
                student=student,
                course=course,
                defaults={
                    "status": Enrollment.Status.ACTIVE
                }
            )

    except IntegrityError:
        return Response(
            {
                "message": "Could not create the enrollment."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not created:
        return Response(
            {
                "message": "This student is already enrolled in this course."
            },
            status=status.HTTP_409_CONFLICT,
        )

    return Response({
        "success": True,
        "message": "Student enrolled successfully.",
        "enrollment": EnrollmentSerializer(enrollment).data,
    }, status=status.HTTP_201_CREATED)


# ============================================================
# 20. MY ENROLLMENTS - DATABASE IMPLEMENTATION
# ============================================================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_enrollments(request):

    queryset = Enrollment.objects.select_related(
        "student__user",
        "course"
    ).filter(
        student__user=request.user
    )

    serializer = EnrollmentSerializer(
        queryset,
        many=True
    )

    return Response({
        "success": True,
        "count": len(serializer.data),
        "enrollments": serializer.data,
    })


# ============================================================
# 21. BULK ENROLL STUDENTS
# ============================================================

@api_view(["POST"])
@permission_classes([IsAdminUser])
def bulk_enroll_students(request):

    course_id = request.data.get("course_id")

    if not course_id:
        return Response(
            {
                "success": False,
                "message": "course_id is required.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        course = Course.objects.get(
            pk=course_id,
            status=Course.Status.PUBLISHED,
            is_archived=False,
        )

    except (Course.DoesNotExist, ValueError, TypeError):
        return Response(
            {
                "success": False,
                "message": "Published course not found.",
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    students = Student.objects.filter(
        is_active=True,
        user__is_active=True,
    ).order_by("id")

    if not students.exists():
        return Response({
            "success": True,
            "message": "No active students are available.",
            "course_id": course.id,
            "course_title": course.title,
            "total_active_students": 0,
            "enrolled_count": 0,
            "skipped_count": 0,
        })

    student_ids = list(
        students.values_list("id", flat=True)
    )

    with transaction.atomic():

        existing_ids = set(
            Enrollment.objects.filter(
                course=course,
                student_id__in=student_ids,
            ).values_list("student_id", flat=True)
        )

        new_enrollments = [
            Enrollment(
                student_id=student_id,
                course=course,
                status=Enrollment.Status.ACTIVE,
            )
            for student_id in student_ids
            if student_id not in existing_ids
        ]

        Enrollment.objects.bulk_create(
            new_enrollments,
            ignore_conflicts=True,
        )

        final_ids = set(
            Enrollment.objects.filter(
                course=course,
                student_id__in=student_ids,
            ).values_list("student_id", flat=True)
        )

    enrolled_count = len(final_ids - existing_ids)
    skipped_count = len(student_ids) - enrolled_count

    return Response({
        "success": True,
        "message": "Bulk enrollment completed.",
        "course_id": course.id,
        "course_title": course.title,
        "total_active_students": len(student_ids),
        "enrolled_count": enrolled_count,
        "skipped_count": skipped_count,
    }, status=status.HTTP_200_OK)


# ============================================================
# 22. MATERIAL PREVIEW API
# Supports PDF, Word, PowerPoint, Excel and other documents
# ============================================================

LIBREOFFICE_PATH = (
    r"C:\Program Files\LibreOffice\program\soffice.exe"
)

OFFICE_EXTENSIONS = {
    ".doc", ".docx",
    ".ppt", ".pptx",
    ".xls", ".xlsx",
    ".odt", ".ods", ".odp",
    ".rtf",
}

DIRECT_PREVIEW_EXTENSIONS = {
    ".pdf",
    ".txt", ".csv",
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".mp4", ".webm", ".mov", ".m4v",
    ".mp3", ".wav", ".ogg",
}


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def material_preview(request, material_id):
    """
    Securely preview uploaded course materials.

    - PDF: directly displayed.
    - DOC/DOCX: converted to PDF.
    - PPT/PPTX: converted to PDF.
    - XLS/XLSX: converted to PDF.
    - Images, audio and video: returned in their original format.
    """

    material = get_object_or_404(
        Material.objects.select_related(
            "topic",
            "topic__course"
        ),
        pk=material_id
    )

    course = material.topic.course

    # Check course access
    can_manage = _mentor_can_manage_course(
        request.user,
        course
    )

    can_view = _user_can_view_course(
        request.user,
        course
    )

    if not can_view:
        return Response(
            {
                "success": False,
                "message": "You do not have permission to view this material."
            },
            status=status.HTTP_403_FORBIDDEN
        )

    # Students cannot view unpublished materials
    if not can_manage and not material.is_published:
        return Response(
            {
                "success": False,
                "message": "This material is not published."
            },
            status=status.HTTP_404_NOT_FOUND
        )

    # Supabase-hosted materials do not have a Django FileField attachment.
    # Redirect the authenticated preview request to the stored Supabase URL.
    if not material.file:
        external_url = (
            getattr(material, "supabase_url", None)
            or getattr(material, "video_url", None)
            or getattr(material, "file_url", None)
        )

        if isinstance(external_url, str):
            external_url = external_url.strip()

        if external_url and external_url.startswith(("https://", "http://")):
            response = redirect(external_url)
            response["X-Content-Type-Options"] = "nosniff"
            return response

        return Response(
            {
                "success": False,
                "message": (
                    "No file is attached and no valid Supabase URL "
                    "is saved for this material."
                )
            },
            status=status.HTTP_404_NOT_FOUND
        )

    try:
        source_path = Path(material.file.path)

        if not source_path.exists():
            return Response(
                {
                    "success": False,
                    "message": "The uploaded file could not be found."
                },
                status=status.HTTP_404_NOT_FOUND
            )

        extension = source_path.suffix.lower()

        # ----------------------------------------------------
        # DIRECT PREVIEW: PDF, IMAGE, AUDIO, VIDEO, TEXT
        # ----------------------------------------------------

        if extension in DIRECT_PREVIEW_EXTENSIONS:

            content_type = mimetypes.guess_type(
                source_path.name
            )[0] or "application/octet-stream"

            response = FileResponse(
                open(source_path, "rb"),
                content_type=content_type
            )

            response["Content-Disposition"] = (
                f'inline; filename="{source_path.name}"'
            )

            response["X-Content-Type-Options"] = "nosniff"

            return response

        # ----------------------------------------------------
        # OFFICE DOCUMENT CONVERSION
        # ----------------------------------------------------

        if extension not in OFFICE_EXTENSIONS:
            return Response(
                {
                    "success": False,
                    "message": (
                        f"Preview is not supported for {extension} files."
                    )
                },
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
            )

        executable = Path(LIBREOFFICE_PATH)

        if not executable.exists():
            return Response(
                {
                    "success": False,
                    "message": (
                        "LibreOffice was not found. "
                        "Please check LIBREOFFICE_PATH."
                    )
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Create temporary conversion directory
        with tempfile.TemporaryDirectory(
            prefix="edutrack_preview_"
        ) as temp_dir:

            output_dir = Path(temp_dir)

            profile_dir = output_dir / "lo_profile"
            profile_dir.mkdir()

            command = [
                str(executable),
                "-env:UserInstallation=" + profile_dir.as_uri(),
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(output_dir),
                str(source_path)
            ]

            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=120,
                check=False
            )

            converted_file = (
                output_dir / f"{source_path.stem}.pdf"
            )

            if (
                result.returncode != 0
                or not converted_file.exists()
            ):
                return Response(
                    {
                        "success": False,
                        "message": "Document conversion failed.",
                        "details": result.stderr[-1000:]
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Read PDF before temporary directory is deleted
            pdf_content = converted_file.read_bytes()

        # ----------------------------------------------------
        # RETURN CONVERTED PDF INLINE
        # ----------------------------------------------------

        response = FileResponse(
            BytesIO(pdf_content),
            content_type="application/pdf"
        )

        response["Content-Disposition"] = (
            f'inline; filename="{source_path.stem}.pdf"'
        )

        response["X-Content-Type-Options"] = "nosniff"

        return response

    except subprocess.TimeoutExpired:
        return Response(
            {
                "success": False,
                "message": "Document conversion timed out. Please try again."
            },
            status=status.HTTP_504_GATEWAY_TIMEOUT
        )

    except Exception as error:
        import logging

        logging.exception("EduTrack material preview failed")

        return Response(
            {
                "success": False,
                "message": "Unable to preview this material.",
                "details": str(error)
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )