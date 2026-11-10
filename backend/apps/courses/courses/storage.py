from pathlib import PurePosixPath

from cloudinary_storage.storage import MediaCloudinaryStorage


class EduTrackCloudinaryStorage(MediaCloudinaryStorage):
    """
    Cloudinary storage for EduTrack learning materials.
    """

    IMAGE_EXTENSIONS = {
        "png", "jpg", "jpeg", "webp", "gif", "pdf"
    }

    VIDEO_EXTENSIONS = {
        "mp4", "webm", "mov", "m4v", "mp3", "wav", "ogg"
    }

    def _get_resource_type(self, name):
        extension = PurePosixPath(name).suffix.lower().lstrip(".")

        if extension in self.IMAGE_EXTENSIONS:
            return "image"

        if extension in self.VIDEO_EXTENSIONS:
            return "video"

        return "raw"