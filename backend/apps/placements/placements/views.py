from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Placement, PlacementApplication
from .serializers import (
    PlacementSerializer,
    PlacementApplicationSerializer,
)


def is_admin_user(user):
    """Support EduTrack admin roles and existing Django staff accounts."""
    role = str(getattr(user, "role", "")).strip().lower()

    return (
        role == "admin"
        or user.is_superuser
        or user.is_staff
    )


def is_student_user(user):
    role = str(getattr(user, "role", "")).strip().lower()
    return role == "student"


def admin_required_response():
    return Response(
        {"error": "Only an admin can perform this action."},
        status=status.HTTP_403_FORBIDDEN,
    )


# 1. List placement records / Create a placement record
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def placements_list_create(request):
    if request.method == "GET":
        placements = Placement.objects.filter(
            is_archived=False
        ).select_related("student", "created_by")

        serializer = PlacementSerializer(
            placements,
            many=True,
            context={"request": request},
        )

        return Response(
            {
                "count": placements.count(),
                "placements": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    if not is_admin_user(request.user):
        return admin_required_response()

    serializer = PlacementSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(
            {
                "error": "Please correct the placement details.",
                "details": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    placement = serializer.save(created_by=request.user)

    return Response(
        {
            "message": "Placement record created successfully.",
            "placement": PlacementSerializer(placement).data,
        },
        status=status.HTTP_201_CREATED,
    )


# 2. Retrieve / Update / Archive a placement record
@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def placement_detail(request, placement_id):
    placement = get_object_or_404(
        Placement.objects.select_related("student", "created_by"),
        pk=placement_id,
        is_archived=False,
    )

    if request.method == "GET":
        serializer = PlacementSerializer(placement)
        return Response(serializer.data, status=status.HTTP_200_OK)

    if not is_admin_user(request.user):
        return admin_required_response()

    if request.method == "DELETE":
        placement.is_archived = True
        placement.save(update_fields=["is_archived", "updated_at"])

        return Response(
            {"message": "Placement record archived successfully."},
            status=status.HTTP_200_OK,
        )

    partial = request.method == "PATCH"
    serializer = PlacementSerializer(
        placement,
        data=request.data,
        partial=partial,
    )

    if not serializer.is_valid():
        return Response(
            {
                "error": "Please correct the placement details.",
                "details": serializer.errors,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer.save()

    return Response(
        {
            "message": "Placement record updated successfully.",
            "placement": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


# 3. Apply for a placement
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def apply_for_placement(request, placement_id):
    if not is_student_user(request.user):
        return Response(
            {"error": "Only student accounts can apply for placements."},
            status=status.HTTP_403_FORBIDDEN,
        )

    placement = get_object_or_404(
        Placement,
        pk=placement_id,
        is_archived=False,
    )

    if placement.status != "open":
        return Response(
            {"error": "Applications are not open for this placement."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():
            application, created = (
                PlacementApplication.objects.get_or_create(
                    placement=placement,
                    student=request.user,
                )
            )
    except IntegrityError:
        # Protect against simultaneous duplicate submissions.
        application = PlacementApplication.objects.filter(
            placement=placement,
            student=request.user,
        ).first()
        created = False

        if application is None:
            return Response(
                {"error": "Unable to submit the application. Please retry."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    if not created:
        return Response(
            {"error": "You have already applied for this placement."},
            status=status.HTTP_409_CONFLICT,
        )

    return Response(
        {
            "message": "Placement application submitted successfully.",
            "application": PlacementApplicationSerializer(
                application
            ).data,
        },
        status=status.HTTP_201_CREATED,
    )


# 4. View the logged-in student's applications
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_placement_applications(request):
    if not is_student_user(request.user):
        return Response(
            {"error": "This endpoint is available to student accounts."},
            status=status.HTTP_403_FORBIDDEN,
        )

    applications = PlacementApplication.objects.filter(
        student=request.user
    ).select_related("placement", "student")

    serializer = PlacementApplicationSerializer(
        applications,
        many=True,
    )

    return Response(
        {
            "count": applications.count(),
            "applications": serializer.data,
        },
        status=status.HTTP_200_OK,
    )