from rest_framework.permissions import BasePermission
from apps.users.users.models import MentorProfile


class IsMentor(BasePermission):
    message = "Only authenticated mentors can access this resource."

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        return MentorProfile.objects.filter(user=user).exists()