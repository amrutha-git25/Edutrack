
from rest_framework import serializers


class AIExamGenerationSerializer(serializers.Serializer):
    course = serializers.CharField(max_length=200)
    topics = serializers.ListField(
        child=serializers.CharField(max_length=200),
        min_length=1,
        max_length=20,
    )
    difficulty = serializers.ChoiceField(
        choices=["Easy", "Medium", "Hard", "Mixed"]
    )
    question_type = serializers.ChoiceField(
        choices=["MCQ"],
        default="MCQ",
    )
    count = serializers.IntegerField(min_value=1, max_value=50)
    duration_minutes = serializers.IntegerField(
        min_value=1,
        max_value=300,
    )

    def validate_topics(self, value):
        cleaned = list(dict.fromkeys(
            topic.strip() for topic in value if topic.strip()
        ))

        if not cleaned:
            raise serializers.ValidationError(
                "Provide at least one valid topic."
            )

        return cleaned


class ReviewedMCQSerializer(serializers.Serializer):
    text = serializers.CharField()
    option_a = serializers.CharField()
    option_b = serializers.CharField()
    option_c = serializers.CharField()
    option_d = serializers.CharField()
    correct_option = serializers.ChoiceField(
        choices=["A", "B", "C", "D"]
    )
    marks = serializers.IntegerField(min_value=1)
    explanation = serializers.CharField(required=False, allow_blank=True)
    difficulty = serializers.ChoiceField(
        choices=["Easy", "Medium", "Hard"],
        required=False,
        default="Medium",
    )
    topic = serializers.CharField(
        max_length=200,
        required=False,
        allow_blank=True,
    )

    def validate(self, attrs):
        options = [
            attrs["option_a"].strip(),
            attrs["option_b"].strip(),
            attrs["option_c"].strip(),
            attrs["option_d"].strip(),
        ]

        if any(not option for option in options):
            raise serializers.ValidationError(
                "All four options must contain text."
            )

        if len({option.casefold() for option in options}) != 4:
            raise serializers.ValidationError(
                "All four options must be different."
            )

        attrs["text"] = attrs["text"].strip()

        if not attrs["text"]:
            raise serializers.ValidationError(
                {"text": "Question text cannot be empty."}
            )

        for key in ("option_a", "option_b", "option_c", "option_d"):
            attrs[key] = attrs[key].strip()

        return attrs


class AIExamSaveSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )
    course_name = serializers.CharField(max_length=200)
    duration_minutes = serializers.IntegerField(
        min_value=1,
        max_value=300,
    )
    passing_marks = serializers.IntegerField(min_value=0)
    questions = ReviewedMCQSerializer(many=True, min_length=1, max_length=50)

    def validate_questions(self, value):
        if not value:
            raise serializers.ValidationError(
                "At least one reviewed question is required."
            )
        return value
