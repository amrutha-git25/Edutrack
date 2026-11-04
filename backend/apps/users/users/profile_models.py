from django.conf import settings
from django.db import models



class UserProfilePicture(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile_picture_record",
    )
    image = models.ImageField(
        upload_to="profile_pictures/",
        blank=True,
        null=True,
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile picture for {self.user.username}"
