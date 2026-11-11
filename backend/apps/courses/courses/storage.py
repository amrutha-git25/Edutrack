"""Supabase Storage helpers for EduTrack course thumbnails."""

import uuid
from pathlib import Path

from django.conf import settings
from supabase import create_client


def upload_course_thumbnail(uploaded_file):
    """
    Upload a course thumbnail to Supabase Storage
    and return its public URL.
    """
    supabase_url = settings.SUPABASE_URL.strip()
    service_role_key = settings.SUPABASE_SERVICE_ROLE_KEY.strip()
    bucket = settings.SUPABASE_COURSE_THUMBNAILS_BUCKET.strip()

    if not supabase_url or not service_role_key:
        raise RuntimeError(
            "Supabase is not configured. Set SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY."
        )

    if not bucket:
        raise RuntimeError(
            "SUPABASE_COURSE_THUMBNAILS_BUCKET is not configured."
        )

    safe_name = Path(uploaded_file.name).name.replace(" ", "_")
    object_path = (
        f"course_thumbnails/{uuid.uuid4().hex}_{safe_name}"
    )

    content_type = (
        getattr(uploaded_file, "content_type", None)
        or "image/jpeg"
    )

    supabase = create_client(
        supabase_url,
        service_role_key,
    )

    uploaded_file.seek(0)

    supabase.storage.from_(bucket).upload(
        object_path,
        uploaded_file.read(),
        file_options={
            "content-type": content_type,
            "upsert": "false",
        },
    )

    public_url = supabase.storage.from_(bucket).get_public_url(
        object_path
    )

    if isinstance(public_url, dict):
        public_url = (
            public_url.get("publicUrl")
            or public_url.get("publicURL")
        )

    elif not isinstance(public_url, str):
        public_url = (
            getattr(public_url, "public_url", None)
            or getattr(public_url, "publicUrl", None)
        )

    if not public_url or not str(public_url).startswith("https://"):
        raise RuntimeError(
            "Supabase did not return a valid public URL."
        )

    return str(public_url)