
from rest_framework import serializers


class DashboardOverviewSerializer(serializers.Serializer):
    students = serializers.DictField()
    courses = serializers.DictField()
    mentors = serializers.DictField()
    revenue = serializers.DictField()
    enrollment_trend = serializers.ListField()
    students_by_course = serializers.ListField()
    recent_enrollments = serializers.ListField()
    recent_activity = serializers.ListField()
    data_status = serializers.DictField()
