
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.users.users.models import Student
from apps.courses.courses.models import Course, Enrollment
from .models import ActivityLog


@receiver(post_save, sender=Student)
def log_student_activity(sender, instance, created, **kwargs):
    if created:
        user = instance.user
        name = user.get_full_name() or user.username

        ActivityLog.objects.create(
            actor=user,
            action="student_created",
            description=f"Student profile created for {name}.",
        )


@receiver(post_save, sender=Course)
def log_course_activity(sender, instance, created, **kwargs):
    if created:
        ActivityLog.objects.create(
            actor=instance.mentor,
            action="course_created",
            description=f"Course created: {instance.title}.",
        )


@receiver(post_save, sender=Enrollment)
def log_enrollment_activity(sender, instance, created, **kwargs):
    if created:
        user = instance.student.user
        name = user.get_full_name() or user.username

        ActivityLog.objects.create(
            actor=user,
            action="student_enrolled",
            description=(
                f"{name} enrolled in {instance.course.title}."
            ),
        )
